import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

function initials(name: string): string {
  return name
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar({
  user,
  members,
}: {
  user: SessionUser;
  members: { name: string; role: string }[];
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-surface px-5">
      {/* Local node status */}
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 animate-pulse-slow rounded-full bg-success" />
        <span className="font-mono text-secondary">Local Node: Idle</span>
        <span className="mx-2 h-4 w-px bg-hairline" />
        <span className="font-mono text-secondary/70">{user.orgName}</span>
      </div>

      {/* Collaboration hub */}
      <div className="flex items-center gap-4">
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((m, i) => (
            <div
              key={i}
              title={`${m.name} · ${m.role}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-overlay text-[10px] font-medium text-dominant ring-1 ring-success/60"
            >
              {initials(m.name)}
            </div>
          ))}
        </div>
        <button className="btn-tool" title="Roadmap — see WRITEUP.md">
          + Invite
        </button>
        <div className="flex items-center gap-2 pl-2">
          <span className="text-xs text-secondary">{user.name}</span>
          <span className="chip-success">{user.role}</span>
          <form action={logoutAction}>
            <button className="btn-tool" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
