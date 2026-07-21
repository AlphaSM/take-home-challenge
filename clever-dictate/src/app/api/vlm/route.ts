import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getVlm } from "@/lib/ai";
import { mockVlm } from "@/lib/ai/mock";

/**
 * POST /api/vlm
 * Body: { image?: string (data URL), hint?: string }
 * Runs the VLM stage: screenshot -> structured screen context.
 *
 * Routing rules:
 *  - A real screenshot goes to the configured VLM.
 *  - A text `hint` (window-title fallback, no capture) only makes sense to the
 *    mock — cloud VLMs take image bytes, so sending hint text there is a
 *    guaranteed 400 (base64 decode failure).
 *  - Any runtime VLM error (rate limit, model overload, parse) degrades to the
 *    deterministic mock instead of 500ing, so the HUD always gets *a* context.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { image, hint } = await req.json().catch(() => ({}));
  try {
    const context = image
      ? await getVlm()
          .describe(image)
          .catch((e) => {
            console.warn("[api/vlm] provider failed, degrading to mock:", (e as Error).message);
            return mockVlm.describe(hint ?? null);
          })
      : await mockVlm.describe(hint ?? null);
    return NextResponse.json({ context });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
