import { describe, expect, it } from "vitest";

import { resolveTaskContent } from "../src/features/send";

describe("resolveTaskContent", () => {
  it("prefers non-empty editing content", () => {
    const result = resolveTaskContent(" Draft task ", "Fallback task");
    expect(result).toBe(" Draft task ");
  });

  it("falls back to block content when editing content is empty", () => {
    const result = resolveTaskContent("   ", "Block task");
    expect(result).toBe("Block task");
  });

  it("returns empty string when both sources are empty", () => {
    const result = resolveTaskContent("", "   ");
    expect(result).toBe("");
  });
});
