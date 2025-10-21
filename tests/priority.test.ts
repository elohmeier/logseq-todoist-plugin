import { describe, expect, it } from "vitest";

import { extractPriorityMarker, todoistPriorityToMarker } from "../src/features/send";

describe("priority helpers", () => {
  it("extracts marker and strips it from content", () => {
    const input = "[#A] Finish report";
    const result = extractPriorityMarker(input);

    expect(result.priority).toBe(4);
    expect(result.content).toBe("Finish report");
  });

  it("returns null when no marker present", () => {
    const result = extractPriorityMarker("Review code");

    expect(result.priority).toBeNull();
    expect(result.content).toBe("Review code");
  });

  it("maps Todoist priority back to marker", () => {
    expect(todoistPriorityToMarker(4)).toBe("A");
    expect(todoistPriorityToMarker(3)).toBe("B");
    expect(todoistPriorityToMarker(1)).toBeNull();
  });
});
