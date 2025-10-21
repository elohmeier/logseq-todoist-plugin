import { describe, expect, it } from "vitest";

import { resolveSendTaskOptions } from "../src/features/send";

describe("resolveSendTaskOptions", () => {
  it("derives priority and scheduling markers from content", () => {
    const result = resolveSendTaskOptions({
      task: "[#A] Draft proposal\nSCHEDULED: <2025-12-01 Mon>\nDEADLINE: <2025-12-05 Fri>",
    });

    expect(result.content).toBe("Draft proposal");
    expect(result.priority).toBe(4);
    expect(result.dueDate).toBe("2025-12-01");
    expect(result.deadlineDate).toBe("2025-12-05");
  });

  it("honours manual scheduled override when clearing the field", () => {
    const result = resolveSendTaskOptions({
      task: "TODO File taxes\nSCHEDULED: <2025-04-01 Tue>",
      scheduledDate: "",
    });

    expect(result.dueDate).toBeUndefined();
    expect(result.dueString).toBeUndefined();
  });

  it("applies manual scheduled override when provided", () => {
    const result = resolveSendTaskOptions({
      task: "TODO Plan trip\nSCHEDULED: <2025-05-01 Thu>",
      scheduledDate: "2025-05-04",
    });

    expect(result.dueDate).toBe("2025-05-04");
  });

  it("uses manual due string when no scheduling is present", () => {
    const result = resolveSendTaskOptions({
      task: "Review logs",
      dueString: "tomorrow",
    });

    expect(result.dueDate).toBeUndefined();
    expect(result.dueString).toBe("tomorrow");
  });

  it("overrides detected priority when specified manually", () => {
    const result = resolveSendTaskOptions({
      task: "[#B] Sync notes",
      priority: "1",
    });

    expect(result.priority).toBe(1);
  });
});
