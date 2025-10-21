import { describe, expect, it } from "vitest";

import { GroupingOption, MetadataOption, parseQuery, SortingOption } from "../src/features/query";

describe("parseQuery", () => {
  it("parses a simple filter string", () => {
    const result = parseQuery("today");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.filter).toBe("today");
    expect(result.config.groupBy).toBe(GroupingOption.Hierarchy);
    expect(result.config.sorting).toEqual([SortingOption.TodoistOrder]);
    expect(result.warnings).toHaveLength(0);
  });

  it("parses YAML configuration with grouping and metadata", () => {
    const yaml = `
filter: "overdue"
groupBy: project
sorting:
  - dateDescending
show:
  - due
  - project
`;
    const result = parseQuery(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.filter).toBe("overdue");
    expect(result.config.groupBy).toBe(GroupingOption.Project);
    expect(result.config.sorting).toEqual([SortingOption.DateDescending]);
    expect(result.config.show.has(MetadataOption.Due)).toBe(true);
    expect(result.config.show.has(MetadataOption.Project)).toBe(true);
  });

  it("returns warnings for unknown keys but still parses known values", () => {
    const result = parseQuery(`{
  "filter": "today",
  "unknown": true
}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.filter).toBe("today");
    expect(result.warnings).toHaveLength(1);
  });

  it("falls back to treating content as filter when YAML parsing fails", () => {
    const result = parseQuery("filter: \"today\"\n  invalid");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.filter).toBe("filter: \"today\"\n  invalid");
    expect(result.warnings).toContain(
      "Unable to parse query as YAML or JSON. Treating content as Todoist filter.",
    );
  });

  it("rejects completely empty queries", () => {
    const result = parseQuery("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe("Query is empty");
  });
});
