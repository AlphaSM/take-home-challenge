import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-core/15 text-core">
            <span className="text-lg">◎</span>
          </div>
          <span className="font-mono text-sm tracking-wider text-dominant">
            CLEVER DICTATE <span className="text-secondary">{"// ENTERPRISE"}</span>
          </span>
        </div>

        <div className="card p-6">
          <h1 className="text-headline-md mb-1">Sign in</h1>
          <p className="mb-6 text-sm text-secondary">
            Local-first dictation for teams. Cloud sync optional.
          </p>

          <LoginForm />

          <div className="my-5 flex items-center gap-3 text-[11px] text-secondary">
            <div className="h-px flex-1 bg-hairline" />
            <span className="font-mono uppercase tracking-wider">or</span>
            <div className="h-px flex-1 bg-hairline" />
          </div>

          {/* Enterprise identity affordances — visually present, wired as stubs.
              See WRITEUP.md for the auth roadmap (SSO/SAML, magic link). */}
          <button
            disabled
            className="mb-2 w-full rounded border border-hairline px-4 py-2 text-sm text-secondary/70 disabled:cursor-not-allowed"
            title="Roadmap — see WRITEUP.md"
          >
            Send passwordless magic link
          </button>
          <button
            disabled
            className="flex w-full items-center justify-center gap-2 rounded border border-hairline px-4 py-2 text-sm text-secondary/70 disabled:cursor-not-allowed"
            title="Roadmap — see WRITEUP.md"
          >
            <span>🛡</span> Sign in with Corporate Identity (SSO / SAML)
          </button>

          <div className="mt-5 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-300/80">
            Offline Mode Active: Local auth token valid. Cloud synchronization
            pauses automatically until connection is restored.
          </div>
        </div>

        {/* Demo helper — seeded credentials. */}
        <div className="mt-4 rounded-lg border border-hairline bg-surface/50 p-3 font-mono text-[11px] text-secondary">
          <div className="mb-1 uppercase tracking-wider text-secondary/70">Demo accounts (pw: password)</div>
          <div>admin@makglobal.com · auditor@makglobal.com · user@makglobal.com</div>
        </div>
      </div>
    </main>
  );
}
