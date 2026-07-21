import { describe, it, expect } from "vitest";
import { mockVlm } from "@/lib/ai/mock";

describe("mockVlm.describe", () => {
  it("detects Jira from a sprint/backlog hint", async () => {
    const ctx = await mockVlm.describe("jira sprint backlog");
    expect(ctx.appContext).toBe("Jira");
  });

  it("detects Gmail from a compose hint", async () => {
    const ctx = await mockVlm.describe("gmail compose");
    expect(ctx.appContext).toBe("Gmail");
  });

  it("falls back to Unknown Application for an unrecognised hint", async () => {
    const ctx = await mockVlm.describe("some random unrelated text");
    expect(ctx.appContext).toBe("Unknown Application");
  });

  it("does not throw on null input", async () => {
    await expect(mockVlm.describe(null)).resolves.toBeTruthy();
    const ctx = await mockVlm.describe(null);
    expect(ctx.appContext).toBe("Unknown Application");
  });

  it("returns a non-empty primitives array", async () => {
    const ctx = await mockVlm.describe("vs code editing a file.ts");
    expect(Array.isArray(ctx.primitives)).toBe(true);
    expect(ctx.primitives.length).toBeGreaterThan(0);
  });

  it("sets the provider field", async () => {
    const ctx = await mockVlm.describe("gmail compose");
    expect(ctx.provider).toBe("mock-vlm");
  });
});
