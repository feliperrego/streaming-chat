import { Footer } from "@/components/footer";
import { IS_MOCK, MODEL_LABEL } from "@/lib/ai/model";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="flex items-center gap-2 border-b px-4 py-3"
        data-model={MODEL_LABEL}
        data-commit={process.env.VERCEL_GIT_COMMIT_SHA ?? "local"}
        // Present only in mock mode. Never pass a boolean: React renders false as "false".
        data-mock={IS_MOCK ? "" : undefined}
      >
        <span className="font-medium">{MODEL_LABEL}</span>
        {IS_MOCK && (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            Mock model
          </span>
        )}
      </header>
      <main className="flex-1 p-4">
        <p>Replace this page.</p>
      </main>
      <Footer />
    </div>
  );
}
