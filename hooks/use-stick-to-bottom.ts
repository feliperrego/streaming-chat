import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SCROLL_THRESHOLD_PX } from "@/lib/chat/config";

/** True when the view is within `threshold` px of the bottom, or the content does not overflow. */
export function isNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = SCROLL_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export type StickToBottom = {
  /** Attach to the scroll container (the element with overflow-y: auto). */
  scrollRef: (element: HTMLElement | null) => void;
  /** Attach to the element inside the container that grows while streaming. */
  contentRef: (element: HTMLElement | null) => void;
  /** False while the user has scrolled away; show "Jump to latest" then. */
  isFollowing: boolean;
  /** Resume following and scroll to the bottom; `smooth` is ignored under prefers-reduced-motion. */
  scrollToBottom: (options?: { smooth?: boolean }) => void;
};

const SCROLL_UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"]);

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Autoscroll for a streaming chat (spec §2.2). While following, a ResizeObserver keeps the
 * view pinned to the bottom with instant scrolls. Following stops at once on an upward wheel,
 * a touch-move that scrolls the content up, or PageUp/ArrowUp/Home outside a text field — but
 * only while the content overflows, since with nothing to scroll there is nothing to jump to.
 * A scroll up that lands more than the threshold from the bottom always stops it. It resumes
 * on a scroll down that lands within the threshold, when the content stops overflowing, or on
 * scrollToBottom(). A scroll event that does not move the view never resumes it.
 */
export function useStickToBottom(): StickToBottom {
  // Callback refs stored in state, so the effects re-run if either element remounts.
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  // Event handlers read the latest value synchronously, before React re-renders.
  const followingRef = useRef(true);

  const setFollowing = useCallback((following: boolean) => {
    followingRef.current = following;
    setIsFollowing(following);
  }, []);

  useEffect(() => {
    if (scrollElement === null) return;
    let lastScrollTop = scrollElement.scrollTop;
    let lastTouchY: number | null = null;

    // With nothing to scroll, no scroll event will ever fire to resume following, so an
    // upward intent here must not stop it (spec §14 A-11): there is nothing to jump to.
    const overflows = () => scrollElement.scrollHeight > scrollElement.clientHeight;
    // A stop intent can arrive between the last pin and that pin's scroll event, which fires
    // only at the next rendering step. Recording the position here makes that event read as no
    // move, so it cannot resume following (spec §14 A-22).
    const stop = () => {
      lastScrollTop = scrollElement.scrollTop;
      setFollowing(false);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && overflows()) stop();
    };
    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touchY = event.touches[0]?.clientY;
      if (touchY === undefined) return;
      // The finger moving down scrolls the content up.
      if (lastTouchY !== null && touchY > lastTouchY && overflows()) stop();
      lastTouchY = touchY;
    };
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const movedUp = scrollTop < lastScrollTop;
      const movedDown = scrollTop > lastScrollTop;
      lastScrollTop = scrollTop;
      const nearBottom = isNearBottom(scrollTop, scrollHeight, clientHeight);
      // Direction matters: an upward wheel's first scroll events still land near the
      // bottom (they must not resume), a smooth Jump passes through positions far
      // from the bottom on its way down (they must not stop following), and an event
      // with no move, like a pin's that a stop intent overtook, must not resume.
      if (nearBottom && movedDown) setFollowing(true);
      else if (!nearBottom && movedUp) setFollowing(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_UP_KEYS.has(event.key) && !isTextEntry(event.target) && overflows()) {
        stop();
      }
    };

    scrollElement.addEventListener("wheel", onWheel, { passive: true });
    scrollElement.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollElement.addEventListener("touchmove", onTouchMove, { passive: true });
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      scrollElement.removeEventListener("wheel", onWheel);
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
      scrollElement.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [scrollElement, setFollowing]);

  // While following, the observers pin the view. Scroll anchoring would move it up on a reflow
  // above it (a question that takes fewer lines after a rotation), and if a script reads the
  // layout before the next frame, that scroll event reaches onScroll before the resize observer
  // pins, reading as a scroll up. So anchoring is off while following, and back on while the
  // visitor reads above the bottom, where it keeps their place (spec §14 A-22).
  useLayoutEffect(() => {
    if (scrollElement === null) return;
    scrollElement.style.setProperty("overflow-anchor", isFollowing ? "none" : "auto");
  }, [scrollElement, isFollowing]);

  useEffect(() => {
    if (scrollElement === null || contentElement === null) return;
    const pin = () => {
      if (followingRef.current) {
        scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: "instant" });
      }
    };
    const resizeObserver = new ResizeObserver(() => {
      if (scrollElement.scrollHeight <= scrollElement.clientHeight) {
        // Nothing overflows (e.g. after New chat): there is nothing to jump to.
        setFollowing(true);
        return;
      }
      pin();
    });
    // The content grows while streaming; the container shrinks when e.g. a mobile keyboard opens.
    resizeObserver.observe(contentElement);
    resizeObserver.observe(scrollElement);
    // A ResizeObserver fires only at the next rendering step, so a task that runs between
    // React's commit and that frame would see the view one line short of the bottom.
    // A MutationObserver runs as a microtask right after the commit and closes that gap.
    const mutationObserver = new MutationObserver(pin);
    mutationObserver.observe(contentElement, { childList: true, subtree: true, characterData: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollElement, contentElement, setFollowing]);

  const scrollToBottom = useCallback(
    ({ smooth = false }: { smooth?: boolean } = {}) => {
      setFollowing(true);
      if (scrollElement === null) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: smooth && !reduceMotion ? "smooth" : "instant",
      });
    },
    [scrollElement, setFollowing],
  );

  return {
    scrollRef: setScrollElement,
    contentRef: setContentElement,
    isFollowing,
    scrollToBottom,
  };
}
