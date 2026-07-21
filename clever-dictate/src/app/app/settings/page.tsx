import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth";
import {
  addProfile,
  deleteProfile,
  addDictionaryEntry,
  deleteDictionaryEntry,
} from "@/lib/actions/config";

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = isAdmin(user.role);
  const [profiles, dictionary] = await Promise.all([
    db.contextProfile.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "asc" } }),
    db.dictionaryEntry.findMany({ where: { orgId: user.orgId }, orderBy: { term: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-headline-xl mb-1">Settings</h1>
      <p className="mb-8 text-sm text-secondary">
        Org-shared configuration for <span className="text-dominant">{user.orgName}</span>.
        {!admin && " (read-only — admin required to edit)"}
      </p>

      {/* Context profiles: the VLM->LLM router matrix */}
      <section className="card mb-8 p-5">
        <h2 className="text-headline-md mb-1">Context Prompt Profiles</h2>
        <p className="mb-4 text-xs text-secondary">
          When the VLM detects an app, the matching profile&apos;s prompt steers LLM cleanup.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-secondary">
                <th className="py-2 pr-4">If app matches</th>
                <th className="py-2 pr-4">Profile</th>
                <th className="py-2 pr-4">Prompt</th>
                {admin && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t border-hairline align-top">
                  <td className="py-2 pr-4 font-mono text-vision">{p.matchApp}</td>
                  <td className="py-2 pr-4">{p.profileName}</td>
                  <td className="py-2 pr-4 text-secondary">{p.prompt}</td>
                  {admin && (
                    <td className="py-2">
                      <form action={deleteProfile}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-destructive hover:underline">Delete</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {admin && (
          <form action={addProfile} className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
            <input name="matchApp" placeholder="e.g. Jira" className="field" />
            <input name="profileName" placeholder="Profile name" className="field" />
            <input name="prompt" placeholder="Prompt transform" className="field md:col-span-1" />
            <button className="btn-primary">Add rule</button>
          </form>
        )}
      </section>

      {/* Corporate dictionary */}
      <section className="card p-5">
        <h2 className="text-headline-md mb-1">Shared Corporate Dictionary</h2>
        <p className="mb-4 text-xs text-secondary">
          Force exact spelling/casing of jargon across every dictation in the org.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-secondary">
                <th className="py-2 pr-4">Heard as</th>
                <th className="py-2 pr-4">Replace with</th>
                {admin && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {dictionary.map((e) => (
                <tr key={e.id} className="border-t border-hairline">
                  <td className="py-2 pr-4 font-mono text-secondary">{e.term}</td>
                  <td className="py-2 pr-4 font-mono text-dominant">{e.replacement}</td>
                  {admin && (
                    <td className="py-2">
                      <form action={deleteDictionaryEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="text-destructive hover:underline">Delete</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {admin && (
          <form action={addDictionaryEntry} className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input name="term" placeholder="Heard as (e.g. mac global)" className="field" />
            <input name="replacement" placeholder="Replace with (e.g. MAKGLOBAL)" className="field" />
            <button className="btn-primary">Add term</button>
          </form>
        )}
      </section>
    </div>
  );
}
