import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DictationHUD } from "@/components/DictationHUD";
import { SessionTimeline } from "@/components/SessionTimeline";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const session = await db.session.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      creator: { select: { name: true } },
      dictations: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!session) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 pb-44">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-headline-lg">{session.title}</h1>
          {session.category && (
            <span className="chip-success font-mono">{session.category}</span>
          )}
        </div>
        <p className="mt-1 font-mono text-xs text-secondary">
          Created by {session.creator.name} · {session.dictations.length} turns
        </p>
      </div>

      <SessionTimeline dictations={session.dictations} />

      <DictationHUD sessionId={session.id} sessionTitle={session.title} />
    </div>
  );
}
