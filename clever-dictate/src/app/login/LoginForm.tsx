"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue="admin@makglobal.com"
          className="field"
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Master password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue="password"
          className="field"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
