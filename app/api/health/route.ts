import { IS_MOCK, MODEL_LABEL } from "@/lib/ai/model";
import { RATE_LIMIT_ENABLED } from "@/lib/rate-limit";

// Never calls the model. Used by the e2e smoke test and by the deploy check
// in spec §9 (must show rateLimit: "upstash" and mock: false in production).
export function GET() {
  return Response.json({
    ok: true,
    model: MODEL_LABEL,
    mock: IS_MOCK,
    rateLimit: RATE_LIMIT_ENABLED ? "upstash" : "off",
  });
}
