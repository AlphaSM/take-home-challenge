"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const user = await db.user.findUnique({
    where: { email },
    include: { memberships: true },
  });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid credentials." };
  }
  if (user.memberships.length === 0) {
    return { error: "This account is not a member of any organization." };
  }

  await createSession(user.id);
  redirect("/app");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
