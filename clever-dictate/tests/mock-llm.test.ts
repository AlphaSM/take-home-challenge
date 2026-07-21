import { describe, it, expect } from "vitest";
import { mockLlm } from "@/lib/ai/mock";
import type { CleanupInput } from "@/lib/ai/types";

function input(rawText: string, extra: Partial<CleanupInput> = {}): CleanupInput {
  return { rawText, context: null, ...extra };
}

describe("mockLlm.cleanup — filler removal", () => {
  it("strips um/uh/like/you know filler words", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("um so uh like you know we should ship this")
    );
    expect(cleanText.toLowerCase()).not.toMatch(/\bum\b/);
    expect(cleanText.toLowerCase()).not.toMatch(/\buh\b/);
    expect(cleanText.toLowerCase()).not.toMatch(/\blike\b/);
    expect(cleanText.toLowerCase()).not.toMatch(/you know/);
    expect(cleanText).toBe("So we should ship this.");
  });
});

describe("mockLlm.cleanup — spoken punctuation", () => {
  it("converts 'new line' to a newline", async () => {
    const { cleanText } = await mockLlm.cleanup(input("first item new line second item"));
    expect(cleanText).toContain("\n");
    expect(cleanText.split("\n").length).toBe(2);
  });

  it("converts 'new paragraph' to a blank line", async () => {
    const { cleanText } = await mockLlm.cleanup(input("intro new paragraph body"));
    expect(cleanText).toContain("\n\n");
  });

  it("converts 'period' to a terminal dot", async () => {
    const { cleanText } = await mockLlm.cleanup(input("this is a sentence period"));
    expect(cleanText).toBe("This is a sentence.");
  });

  it("converts 'comma' to a comma without stray space", async () => {
    const { cleanText } = await mockLlm.cleanup(input("apples comma oranges and pears"));
    expect(cleanText).toContain("Apples,");
    expect(cleanText).not.toContain(" ,");
  });
});

describe("mockLlm.cleanup — capitalisation and terminal punctuation", () => {
  it("capitalises the first letter of the sentence", async () => {
    const { cleanText } = await mockLlm.cleanup(input("hello there"));
    expect(cleanText.startsWith("H")).toBe(true);
  });

  it("adds terminal punctuation without a stray leading space", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("mac global ships next week", {
        dictionary: [{ term: "mac global", replacement: "MAKGLOBAL" }],
      })
    );
    expect(cleanText).toBe("MAKGLOBAL ships next week.");
    expect(cleanText).not.toContain(" .");
  });

  it("does not duplicate terminal punctuation if already present", async () => {
    const { cleanText } = await mockLlm.cleanup(input("already done!"));
    expect(cleanText).toBe("Already done!");
  });
});

describe("mockLlm.cleanup — dictionary replacement", () => {
  it("replaces dictionary terms case-insensitively as whole words", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("please contact makglobal for support", {
        dictionary: [{ term: "MakGlobal", replacement: "MAKGLOBAL" }],
      })
    );
    expect(cleanText).toBe("Please contact MAKGLOBAL for support.");
  });

  it("does not replace partial word matches", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("the cat sat on the mat", {
        dictionary: [{ term: "cat", replacement: "DOG" }],
      })
    );
    expect(cleanText).toBe("The DOG sat on the mat.");
    // "mat" must not be affected
    expect(cleanText).not.toMatch(/DOGmat|maDOG/i);
  });

  it("does not crash on regex-special characters in dictionary terms", async () => {
    await expect(
      mockLlm.cleanup(
        input("c++ is fast and so is c#", {
          dictionary: [
            { term: "c++", replacement: "CPP" },
            { term: "c#", replacement: "CSHARP" },
          ],
        })
      )
    ).resolves.toBeTruthy();
  });

  it("replaces regex-special-character terms correctly", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("please use c++ for this module", {
        dictionary: [{ term: "c++", replacement: "CPP" }],
      })
    );
    expect(cleanText).toContain("CPP");
  });

  it("ignores empty/blank dictionary terms without crashing", async () => {
    await expect(
      mockLlm.cleanup(
        input("hello world", { dictionary: [{ term: "", replacement: "X" }] })
      )
    ).resolves.toBeTruthy();
  });
});

describe("mockLlm.cleanup — Jira/Linear/Notion bullet-ification", () => {
  it("bullet-ifies list-like dictation for a Jira context", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("add retries, fix cookies and write tests", {
        context: {
          appContext: "Jira",
          summary: "Editing a Jira ticket",
          primitives: [],
          provider: "mock-vlm",
        },
      })
    );
    const lines = cleanText.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line.startsWith("- ")).toBe(true);
    }
  });

  it("does not bullet-ify for a non-list context (e.g. Gmail)", async () => {
    const { cleanText } = await mockLlm.cleanup(
      input("add retries, fix cookies and write tests", {
        context: {
          appContext: "Gmail",
          summary: "Drafting an email",
          primitives: [],
          provider: "mock-vlm",
        },
      })
    );
    expect(cleanText.startsWith("- ")).toBe(false);
  });
});

describe("mockLlm.cleanup — empty input handling", () => {
  it("handles an empty string without throwing", async () => {
    const { cleanText } = await mockLlm.cleanup(input(""));
    expect(cleanText).toBe("");
  });

  it("handles a whitespace-only string without throwing", async () => {
    const { cleanText } = await mockLlm.cleanup(input("   "));
    expect(cleanText).toBe("");
  });
});
