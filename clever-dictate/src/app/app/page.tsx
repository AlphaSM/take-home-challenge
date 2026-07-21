import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DictationHUD } from "@/components/DictationHUD";
import Link from "next/link";

export default async function AppHome() {
  const user = await requireUser();
  const recent = await db.session.findMany({
    where: { orgId: user.orgId },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: { _count: { select: { dictations: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 pb-40">
      <h1 className="text-headline-xl mb-2">Welcome back, {user.name.split(" ")[0]}.</h1>
      <p className="mb-8 text-secondary">
        Click the mic below to start a new dictation. Clever captures your screen
        context, transcribes your speech, and cleans it up for the app you&apos;re in.
      </p>

      <div className="mb-3 label">Recent sessions</div>
      <div className="space-y-2">
        {recent.length === 0 && (
          <p className="text-sm text-secondary/70">
            No sessions yet — your first dictation will create one.
          </p>
        )}
        {recent.map((s) => (
          <Link
            key={s.id}
            href={`/app/sessions/${s.id}`}
            className="card flex items-center justify-between px-4 py-3 transition-colors hover:bg-overlay"
          >
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              {s.category && (
                <div className="font-mono text-[11px] text-secondary">{s.category}</div>
              )}
            </div>
            <span className="font-mono text-xs text-secondary">
              {s._count.dictations} turns
            </span>
          </Link>
        ))}
      </div>

      {/* New-session HUD (no sessionId -> creates a session on first save). */}
      <DictationHUD sessionTitle="New Dictation" />
    </div>
  );
}
