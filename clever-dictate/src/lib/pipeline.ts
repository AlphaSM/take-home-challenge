import { db } from "./db";
import { getLlm, type ScreenContext, type CleanupResult } from "./ai";

/**
 * Given a detected app context, resolve the org-shared prompt profile whose
 * `matchApp` is a substring of the app name (case-insensitive), plus the org's
 * shared dictionary. This is the VLM->LLM router (Design.md step 3 -> 5).
 */
export async function resolveCleanup(
  orgId: string,
  context: ScreenContext | null,
  rawText: string,
): Promise<CleanupResult & { profileName: string | null }> {
  const [profiles, dictionary] = await Promise.all([
    db.contextProfile.findMany({ where: { orgId, enabled: true } }),
    db.dictionaryEntry.findMany({ where: { orgId } }),
  ]);

  const app = (context?.appContext ?? "").toLowerCase();
  const profile = app
    ? profiles.find((p) => app.includes(p.matchApp.toLowerCase()))
    : undefined;

  const llm = getLlm();
  const result = await llm.cleanup({
    rawText,
    context,
    profilePrompt: profile?.prompt ?? null,
    dictionary: dictionary.map((d) => ({ term: d.term, replacement: d.replacement })),
  });

  return { ...result, profileName: profile?.profileName ?? null };
}

/** Append-only audit helper. */
export async function audit(
  orgId: string,
  actorId: string | null,
  action: string,
  target?: string,
): Promise<void> {
  await db.auditLog.create({ data: { orgId, actorId, action, target } });
}
