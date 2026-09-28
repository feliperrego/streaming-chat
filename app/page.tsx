import { Chat } from "@/components/chat/chat";
import { Footer } from "@/components/footer";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { IS_MOCK, MODEL_LABEL } from "@/lib/ai/model";
import { RATE_LIMIT_PER_HOUR } from "@/lib/rate-limit";

/**
 * Server component (spec §3.4): lib/ai/model.ts and lib/rate-limit.ts are
 * server-only, so their values reach the client chat as props. The locale is
 * resolved on the client, so the page still prerenders in English (delta spec §4.2).
 */
export default function Home() {
  return (
    <LocaleProvider>
      <div className="flex h-dvh flex-col">
        <Chat
          modelLabel={MODEL_LABEL}
          isMock={IS_MOCK}
          commit={process.env.VERCEL_GIT_COMMIT_SHA ?? "local"}
          rateLimitPerHour={RATE_LIMIT_PER_HOUR}
        />
        <Footer />
      </div>
    </LocaleProvider>
  );
}
