"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth";
import { audit } from "@/lib/pipeline";

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw new Error("FORBIDDEN");
  return user;
}

// --- Context profiles (VLM->LLM router rules) ------------------------------

export async function addProfile(formData: FormData) {
  const user = await requireAdmin();
  const matchApp = String(formData.get("matchApp") ?? "").trim();
  const profileName = String(formData.get("profileName") ?? "").trim();
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!matchApp || !profileName || !prompt) return;
  await db.contextProfile.create({
    data: { orgId: user.orgId, matchApp, profileName, prompt },
  });
  await audit(user.orgId, user.id, "profile.create", `${profileName} (matches ${matchApp})`);
  revalidatePath("/app/settings");
}

export async function deleteProfile(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.contextProfile.deleteMany({ where: { id, orgId: user.orgId } });
  await audit(user.orgId, user.id, "profile.delete", id);
  revalidatePath("/app/settings");
}

// --- Corporate dictionary --------------------------------------------------

export async function addDictionaryEntry(formData: FormData) {
  const user = await requireAdmin();
  const term = String(formData.get("term") ?? "").trim();
  const replacement = String(formData.get("replacement") ?? "").trim();
  if (!term || !replacement) return;
  await db.dictionaryEntry.upsert({
    where: { orgId_term: { orgId: user.orgId, term } },
    update: { replacement },
    create: { orgId: user.orgId, term, replacement },
  });
  await audit(user.orgId, user.id, "dictionary.propagate", `${term} → ${replacement}`);
  revalidatePath("/app/settings");
}

export async function deleteDictionaryEntry(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.dictionaryEntry.deleteMany({ where: { id, orgId: user.orgId } });
  await audit(user.orgId, user.id, "dictionary.delete", id);
  revalidatePath("/app/settings");
}

// --- Governance ------------------------------------------------------------

export async function updateRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "USER");
  if (!["ADMIN", "AUDITOR", "USER"].includes(role)) return;
  await db.membership.updateMany({
    where: { userId, orgId: admin.orgId },
    data: { role },
  });
  await audit(admin.orgId, admin.id, "rbac.update", `set ${userId} to ${role}`);
  revalidatePath("/app/admin");
}

export async function toggleGovernance(formData: FormData) {
  const admin = await requireAdmin();
  const field = String(formData.get("field") ?? "");
  if (!["enforceE2EE", "zeroDataRetention"].includes(field)) return;
  const org = await db.organization.findUnique({ where: { id: admin.orgId } });
  if (!org) return;
  const current = (org as unknown as Record<string, boolean>)[field];
  await db.organization.update({
    where: { id: admin.orgId },
    data: { [field]: !current },
  });
  await audit(admin.orgId, admin.id, "governance.toggle", `${field} = ${!current}`);
  revalidatePath("/app/admin");
}
