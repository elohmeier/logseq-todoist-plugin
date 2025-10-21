import { describe, expect, it } from "vitest";

import { sanitizeBlockContent } from "../src/features/update";

describe("sanitizeBlockContent", () => {
  it("removes managed properties and logbook entries", () => {
    const input = `TODO Check status
 todoistid:: 123
 todoist_url:: todoist://task?id=123
 :LOGBOOK:
 CLOCK: [2025-01-01 Wed 10:00]--[2025-01-01 Wed 10:30] => 00:30:00
 :END:
 Notes here`;

    const result = sanitizeBlockContent(input);

    expect(result).toBe("TODO Check status\nNotes here");
  });

  it("removes todoist-url property (hyphenated format)", () => {
    const input = `TODO Check status
 todoistid:: 123
 todoist-url:: todoist://task?id=123
 Notes here`;

    const result = sanitizeBlockContent(input);

    expect(result).toBe("TODO Check status\nNotes here");
  });

  it("returns trimmed content when nothing to remove", () => {
    const input = "TODO Simple task   ";
    expect(sanitizeBlockContent(input)).toBe("TODO Simple task");
  });
});
