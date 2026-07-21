import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const SESSION_COOKIE = "clever_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// --- Password hashing (scrypt; no external dep) ---------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}

// --- Session lifecycle -----------------------------------------------------

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.authSession.deleteMany({ where: { token } });
    jar.delete(SESSION_COOKIE);
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  // Active org context resolved from the user's first membership.
  orgId: string;
  orgName: string;
  role: string;
};

/**
 * Resolve the current authenticated user + their active org membership.
 * Returns null if not logged in or the session has expired.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.authSession.findUnique({
    where: { token },
    include: {
      user: { include: { memberships: { include: { org: true }, take: 1 } } },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const membership = session.user.memberships[0];
  if (!membership) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    orgId: membership.orgId,
    orgName: membership.org.name,
    role: membership.role,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export function isAdmin(role: string): boolean {
  return role === "ADMIN";
}
