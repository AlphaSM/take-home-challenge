import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCleanup } from "@/lib/pipeline";

/**
 * POST /api/cleanup
 * Body: { rawText: string, context?: ScreenContext }
 * Runs the LLM cleanup stage WITHOUT persisting — used for live preview in the
 * HUD before the user commits the turn.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rawText, context } = await req.json().catch(() => ({}));
  if (typeof rawText !== "string")
    return NextResponse.json({ error: "rawText required" }, { status: 400 });

  const result = await resolveCleanup(user.orgId, context ?? null, rawText);
  return NextResponse.json(result);
}
