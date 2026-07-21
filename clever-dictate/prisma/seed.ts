import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

async function main() {
  // Idempotent-ish: wipe org-scoped data for a clean, repeatable demo.
  await db.auditLog.deleteMany();
  await db.dictation.deleteMany();
  await db.session.deleteMany();
  await db.contextProfile.deleteMany();
  await db.dictionaryEntry.deleteMany();
  await db.membership.deleteMany();
  await db.authSession.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();

  const org = await db.organization.create({
    data: { name: "MakGlobal", slug: "makglobal" },
  });

  // Password for every seeded account is "password".
  const pw = hashPassword("password");
  const [admin, auditor, member] = await Promise.all([
    db.user.create({ data: { email: "admin@makglobal.com", name: "S: Admin", passwordHash: pw } }),
    db.user.create({ data: { email: "auditor@makglobal.com", name: "Ava Auditor", passwordHash: pw } }),
    db.user.create({ data: { email: "user@makglobal.com", name: "Marcus V.", passwordHash: pw } }),
  ]);

  await db.membership.createMany({
    data: [
      { userId: admin.id, orgId: org.id, role: "ADMIN" },
      { userId: auditor.id, orgId: org.id, role: "AUDITOR" },
      { userId: member.id, orgId: org.id, role: "USER" },
    ],
  });

  // Org-shared config: VLM->LLM routing rules.
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

  // Shared corporate dictionary.
  await db.dictionaryEntry.createMany({
    data: [
      { orgId: org.id, term: "mac global", replacement: "MAKGLOBAL" },
      { orgId: org.id, term: "makglobal", replacement: "MAKGLOBAL" },
      { orgId: org.id, term: "stgnn", replacement: "STGNN" },
      { orgId: org.id, term: "clever dictate", replacement: "Clever Dictate" },
    ],
  });

  // A realistic session with a couple of dictation turns.
  const session = await db.session.create({
    data: {
      title: "Feature/Auth-Sync Debugging",
      orgId: org.id,
      createdBy: member.id,
      category: "VS Code",
    },
  });

  await db.dictation.createMany({
    data: [
      {
        sessionId: session.id,
        authorId: member.id,
        appContext: "VS Code",
        contextSummary: "IDE editing auth/session.ts",
        contextJson: JSON.stringify({ primitives: [{ label: "editor: session.ts" }] }),
        rawText: "um so the session token is like not being refreshed on the client you know new line we need to check the expiry",
        cleanText:
          "The session token is not being refreshed on the client.\nWe need to check the expiry.",
        vlmProvider: "mock-vlm",
        sttProvider: "browser",
        llmProvider: "mock-llm",
      },
      {
        sessionId: session.id,
        authorId: member.id,
        appContext: "Jira",
        contextSummary: "Editing a Jira ticket",
        rawText:
          "add retry logic and fix the cookie same site attribute and write a regression test",
        cleanText: "- Add retry logic.\n- Fix the cookie SameSite attribute.\n- Write a regression test.",
        vlmProvider: "mock-vlm",
        sttProvider: "browser",
        llmProvider: "mock-llm",
      },
    ],
  });

  const marketing = await db.session.create({
    data: {
      title: "Marketing Outreach Draft",
      orgId: org.id,
      createdBy: admin.id,
      category: "Gmail",
    },
  });
  await db.dictation.create({
    data: {
      sessionId: marketing.id,
      authorId: admin.id,
      appContext: "Gmail",
      contextSummary: "Drafting an email",
      rawText: "hey team wanted to share that mac global is launching the new dictation tool next week",
      cleanText:
        "Hi team, I wanted to share that MAKGLOBAL is launching the new dictation tool next week.",
      vlmProvider: "mock-vlm",
      sttProvider: "browser",
      llmProvider: "mock-llm",
    },
  });

  await db.auditLog.createMany({
    data: [
      { orgId: org.id, actorId: member.id, action: "session.create", target: "Feature/Auth-Sync Debugging" },
      { orgId: org.id, actorId: admin.id, action: "dictionary.propagate", target: "Shared dictionary map propagated to org" },
      { orgId: org.id, actorId: admin.id, action: "profile.update", target: "VLM context profile for 'Jira'" },
    ],
  });

  console.log("Seeded org 'MakGlobal' with 3 users (admin/auditor/user @makglobal.com, pw: password).");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
