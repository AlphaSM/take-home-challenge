import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveCleanup, audit } from "@/lib/pipeline";
import { getVlm, getLlm, type ScreenContext } from "@/lib/ai";

const Body = z.object({
  sessionId: z.string().optional(),
  sessionTitle: z.string().optional(),
  rawText: z.string(),
  context: z
    .object({
      appContext: z.string(),
      summary: z.string(),
      primitives: z.array(z.any()).optional(),
      provider: z.string().optional(),
    })
    .nullable()
    .optional(),
});

/**
 * POST /api/dictations
 * Persist a full dictation turn: runs LLM cleanup (with org profile + dictionary),
 * saves raw+clean+context provenance, creates the session if needed, audits it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { sessionId, sessionTitle, rawText, context: rawContext } = parsed.data;
  // Normalise the loosely-validated body into a full ScreenContext.
  const context: ScreenContext | null = rawContext
    ? {
        appContext: rawContext.appContext,
        summary: rawContext.summary,
        primitives: (rawContext.primitives ?? []) as ScreenContext["primitives"],
        provider: rawContext.provider ?? "unknown",
      }
    : null;

  // Resolve or create the target session (org-scoped).
  let session = sessionId
    ? await db.session.findFirst({ where: { id: sessionId, orgId: user.orgId } })
    : null;
  if (!session) {
    session = await db.session.create({
      data: {
        title: sessionTitle?.trim() || "Untitled Session",
        orgId: user.orgId,
        createdBy: user.id,
        category: context?.appContext ?? null,
      },
    });
    await audit(user.orgId, user.id, "session.create", session.title);
  }

  const cleanup = await resolveCleanup(user.orgId, context ?? null, rawText);

  const dictation = await db.dictation.create({
    data: {
      sessionId: session.id,
      authorId: user.id,
      appContext: context?.appContext ?? null,
      contextSummary: context?.summary ?? null,
      contextJson: context ? JSON.stringify(context) : null,
      rawText,
      cleanText: cleanup.cleanText,
      vlmProvider: getVlm().name,
      sttProvider: process.env.STT_PROVIDER ?? "browser",
      llmProvider: getLlm().name,
    },
  });
  await db.session.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

  return NextResponse.json({
    dictation,
    sessionId: session.id,
    profileName: cleanup.profileName,
  });
}
