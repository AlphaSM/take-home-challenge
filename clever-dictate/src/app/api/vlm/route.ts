import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getVlm } from "@/lib/ai";

/**
 * POST /api/vlm
 * Body: { image?: string (data URL), hint?: string }
 * Runs the VLM stage: screenshot -> structured screen context.
 * When offline (mock provider), `hint` lets the caller pass window-title text
 * so the demo still produces a meaningful context.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { image, hint } = await req.json().catch(() => ({}));
  const vlm = getVlm();
  try {
    const context = await vlm.describe(image ?? hint ?? null);
    return NextResponse.json({ context });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
