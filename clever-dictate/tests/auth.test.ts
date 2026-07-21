import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth";

describe("hashPassword", () => {
  it("produces a salt:hash formatted string", () => {
    const stored = hashPassword("correct horse battery staple");
    const parts = stored.split(":");
    expect(parts.length).toBe(2);
    const [salt, hash] = parts;
    expect(salt.length).toBeGreaterThan(0);
    expect(hash.length).toBeGreaterThan(0);
    // salt is 16 random bytes -> 32 hex chars; derived key is 64 bytes -> 128 hex chars
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it("produces different salts (and hashes) for repeated calls", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("hunter2", stored)).toBe(true);
  });

  it("returns false for a wrong password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("returns false for a malformed stored value (no colon)", () => {
    expect(verifyPassword("hunter2", "not-a-valid-stored-value")).toBe(false);
  });

  it("returns false for a malformed stored value (empty string)", () => {
    expect(verifyPassword("hunter2", "")).toBe(false);
  });

  it("returns false for a malformed stored value (missing hash half)", () => {
    expect(verifyPassword("hunter2", "abcdef:")).toBe(false);
  });
});
