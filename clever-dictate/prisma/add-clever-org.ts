import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

// Additive, idempotent seed for the "Clever Profits" organization and its
// logins. Unlike prisma/seed.ts this does NOT wipe existing data — it upserts,
// so it's safe to run against a live DB and re-runnable. Mirrors the seed's
// scrypt password format (see lib/auth) and the admin/auditor/user pattern.
//
//   Run: npx tsx prisma/add-clever-org.ts

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const ORG_SLUG = "clever-profits";
const ORG_NAME = "Clever Profits";
const PASSWORD = "password";

const ACCOUNTS: Array<{ email: string; name: string; role: string }> = [
  { email: "admin@clever.com", name: "Clever Admin", role: "ADMIN" },
  { email: "auditor@clever.com", name: "Clever Auditor", role: "AUDITOR" },
  { email: "user@clever.com", name: "Clever User", role: "USER" },
];

async function main() {
  const org = await db.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME },
    create: { name: ORG_NAME, slug: ORG_SLUG },
  });

  for (const acct of ACCOUNTS) {
    // Only (re)set the password on create so re-runs don't clobber a changed one.
    const user = await db.user.upsert({
      where: { email: acct.email },
      update: { name: acct.name },
      create: { email: acct.email, name: acct.name, passwordHash: hashPassword(PASSWORD) },
    });

    await db.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: { role: acct.role },
      create: { userId: user.id, orgId: org.id, role: acct.role },
    });
  }

  // Give the org the same functional context profiles + dictionary as the demo
  // org, so VLM->LLM routing works out of the box. Scoped strictly to this org.
  await db.contextProfile.deleteMany({ where: { orgId: org.id } });
  await db.contextProfile.createMany({
    data: [
      {
        orgId: org.id,
        matchApp: "Jira",
        profileName: "Scrum Master",
        prompt: "Rewrite as formal, concise bullet points. Strip emotional filler. Use imperative voice.",
      },
      {
        orgId: org.id,
        matchApp: "Gmail",
        profileName: "Professional Email",
        prompt: "Format as a polite, well-structured email body. Preserve intent, improve clarity.",
      },
      {
        orgId: org.id,
        matchApp: "VS Code",
        profileName: "Code Comment",
        prompt: "Format as a terse technical note suitable for a code comment or commit message.",
      },
    ],
  });

  await db.dictionaryEntry.deleteMany({ where: { orgId: org.id } });
  await db.dictionaryEntry.createMany({
    data: [
      { orgId: org.id, term: "clever profits", replacement: "Clever Profits" },
      { orgId: org.id, term: "clever dictate", replacement: "Clever Dictate" },
    ],
  });

  console.log(
    `Upserted org '${ORG_NAME}' (${ORG_SLUG}) with ${ACCOUNTS.length} accounts: ` +
      `${ACCOUNTS.map((a) => a.email).join(", ")} — pw: ${PASSWORD}`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
