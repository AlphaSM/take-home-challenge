import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [sessions, members] = await Promise.all([
    db.session.findMany({
      where: { orgId: user.orgId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, category: true },
    }),
    db.membership.findMany({
      where: { orgId: user.orgId },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar sessions={sessions} user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          members={members.map((m) => ({ name: m.user.name, role: m.role }))}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
