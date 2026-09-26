import { Chat } from "@/components/chat/chat";
import { Footer } from "@/components/footer";
import { IS_MOCK, MODEL_LABEL } from "@/lib/ai/model";
import { RATE_LIMIT_PER_HOUR } from "@/lib/rate-limit";

/**
 * Server component (spec §3.4): lib/ai/model.ts and lib/rate-limit.ts are
 * server-only, so their values reach the client chat as props.
 */
export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <Chat
        modelLabel={MODEL_LABEL}
        isMock={IS_MOCK}
        commit={process.env.VERCEL_GIT_COMMIT_SHA ?? "local"}
        rateLimitPerHour={RATE_LIMIT_PER_HOUR}
      />
      <Footer />
    </div>
  );
}
