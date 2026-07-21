import Link from "next/link";
import type { SessionUser } from "@/lib/auth";

type SessionLite = { id: string; title: string; category: string | null };

const FILTERS = ["All Dictations", "VS Code", "Slack", "Jira", "Gmail"];

export function Sidebar({
  sessions,
  user,
}: {
  sessions: SessionLite[];
  user: SessionUser;
}) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-hairline bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-core/15 text-core">◎</div>
        <span className="font-mono text-xs tracking-wider">CLEVER DICTATE</span>
      </div>

      {/* Search */}
      <div className="px-3">
        <input
          className="field py-1.5 text-xs"
          placeholder="Search transcribed text, apps, tags…"
          aria-label="Search"
        />
      </div>

      {/* Filters */}
      <nav className="mt-4 px-2">
        <div className="label px-2">Filters</div>
        {FILTERS.map((f) => (
          <button
            key={f}
            className="block w-full rounded px-2 py-1.5 text-left text-sm text-secondary transition-colors hover:bg-overlay hover:text-dominant"
          >
            {f}
          </button>
        ))}
      </nav>

      {/* Sessions */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        <div className="label flex items-center justify-between px-2">
          <span>Sessions</span>
          <Link href="/app" className="text-core hover:underline">
            + New
          </Link>
        </div>
        {sessions.length === 0 && (
          <p className="px-2 py-2 text-xs text-secondary/70">No sessions yet.</p>
        )}
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/app/sessions/${s.id}`}
            className="group block truncate rounded border-l-2 border-transparent px-2 py-1.5 text-sm text-secondary transition-colors hover:border-core hover:bg-overlay hover:text-dominant"
          >
            {s.title}
            {s.category && (
              <span className="ml-1 font-mono text-[10px] text-secondary/50">
                {s.category}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Footer: settings + admin + user */}
      <div className="border-t border-hairline p-3 text-sm">
        <Link
          href="/app/settings"
          className="block rounded px-2 py-1.5 text-secondary hover:bg-overlay hover:text-dominant"
        >
          ⚙ Settings
        </Link>
        {(user.role === "ADMIN" || user.role === "AUDITOR") && (
          <Link
            href="/app/admin"
            className="block rounded px-2 py-1.5 text-secondary hover:bg-overlay hover:text-dominant"
          >
            🛡 Admin & Governance{user.role === "AUDITOR" ? " (read-only)" : ""}
          </Link>
        )}
      </div>
    </aside>
  );
}
