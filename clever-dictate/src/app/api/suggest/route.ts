import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLlm } from "@/lib/ai";

/**
 * POST /api/suggest
 * Given enriched context + text, return follow-up action suggestions
 * (the "AI suggestions" button in the workflow).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rawText, context } = await req.json().catch(() => ({}));
  const llm = getLlm();
  const suggestions = llm.suggest
    ? await llm.suggest({ rawText: rawText ?? "", context: context ?? null })
    : [];
  return NextResponse.json({ suggestions });
}
