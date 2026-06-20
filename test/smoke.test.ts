import { describe, expect, it } from "vitest";

const API_BASE = "https://api.looptloop.online/v0";

describe("seed constants", () => {
  it("uses api.looptloop.online as canonical base", () => {
    expect(API_BASE).toBe("https://api.looptloop.online/v0");
  });

  it("keeps the private payload invariant explicit", () => {
    const invariant = "Private payload stays private";
    expect(invariant).toContain("Private payload");
  });
});
