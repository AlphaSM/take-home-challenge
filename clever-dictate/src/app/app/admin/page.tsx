import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth";
import { updateRole, toggleGovernance } from "@/lib/actions/config";

const ROLES = ["ADMIN", "AUDITOR", "USER"];

export default async function AdminPage() {
  const user = await requireUser();
  // ADMIN gets full control; AUDITOR gets read-only oversight (that's the job).
  const canEdit = isAdmin(user.role);
  if (!canEdit && user.role !== "AUDITOR") redirect("/app");

  const [org, members, logs, tokenStats] = await Promise.all([
    db.organization.findUnique({ where: { id: user.orgId } }),
    db.membership.findMany({
      where: { orgId: user.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    db.auditLog.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true } } },
    }),
    db.dictation.count({ where: { session: { orgId: user.orgId } } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-headline-xl mb-1">Admin &amp; Data Governance</h1>
      <p className="mb-8 text-sm text-secondary">Control center for {user.orgName}.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Quadrant A: RBAC matrix */}
        <section className="card p-5">
          <h2 className="text-headline-md mb-3">User Directory &amp; RBAC</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-secondary">
                <th className="py-2">User</th>
                <th className="py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-hairline">
                  <td className="py-2">
                    <div>{m.user.name}</div>
                    <div className="font-mono text-[11px] text-secondary">{m.user.email}</div>
                  </td>
                  <td className="py-2">
                    {canEdit ? (
                      <form action={updateRole} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={m.user.id} />
                        <select
                          name="role"
                          defaultValue={m.role}
                          className="field w-auto py-1 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button className="btn-tool">Save</button>
                      </form>
                    ) : (
                      <span className="chip-success">{m.role}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Quadrant C: token telemetry (lightweight) */}
        <section className="card p-5">
          <h2 className="text-headline-md mb-3">Cost &amp; Telemetry</h2>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Dictation turns (org)" value={String(tokenStats)} />
            <Metric label="Active members" value={String(members.length)} />
            <Metric label="VLM provider" value={process.env.VLM_PROVIDER ?? "mock"} />
            <Metric label="LLM provider" value={process.env.LLM_PROVIDER ?? "mock"} />
          </div>
          <p className="mt-3 text-[11px] text-secondary">
            Local-first: turns processed by mock/local providers cost $0 in cloud inference.
          </p>
        </section>

        {/* Quadrant B: audit ledger */}
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-headline-md mb-3">System Audit &amp; Transparency Ledger</h2>
          <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
            {logs.map((l) => (
              <div key={l.id} className="flex gap-3 border-b border-hairline py-1.5">
                <span className="shrink-0 text-secondary/60">
                  {l.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </span>
                <span className="shrink-0 text-core">{l.action}</span>
                <span className="text-secondary">
                  {l.actor?.name ?? "system"} — {l.target ?? ""}
                </span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-secondary/70">No events yet.</p>}
          </div>
        </section>

        {/* Quadrant D: privacy toggles */}
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-headline-md mb-3">Data Privacy &amp; Encryption</h2>
          <div className="space-y-3">
            <GovToggle
              field="enforceE2EE"
              on={!!org?.enforceE2EE}
              disabled={!canEdit}
              label="Enforce Client-Side E2EE on shared sync channels"
            />
            <GovToggle
              field="zeroDataRetention"
              on={!!org?.zeroDataRetention}
              disabled={!canEdit}
              label="Zero Data Retention (purge raw audio & screenshots post-injection)"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-hairline bg-base p-3">
      <div className="font-mono text-[11px] uppercase tracking-wider text-secondary">{label}</div>
      <div className="mt-1 text-lg font-semibold text-dominant">{value}</div>
    </div>
  );
}

function GovToggle({
  field,
  on,
  label,
  disabled = false,
}: {
  field: string;
  on: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <form action={toggleGovernance} className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <input type="hidden" name="field" value={field} />
      <button
        disabled={disabled}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          on ? "bg-core" : "bg-overlay glass-edge"
        }`}
        aria-pressed={on}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </form>
  );
}
