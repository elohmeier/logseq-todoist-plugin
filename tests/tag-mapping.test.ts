import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __clearTagMappingCacheForTests,
  extractTagsFromContent,
  formatTagReference,
  lookupTagsForLabels,
  lookupTagsForProject,
  resolveContentTagMappings,
} from "../src/features/tag-mapping";

describe("tag-mapping utilities", () => {
  const mockDatascriptQuery = vi.fn<
    (query: string) => Promise<[string, unknown][]>
  >();
  const mockGetBlock = vi.fn<
    (uuid: string, options?: { includeChildren?: boolean }) => Promise<unknown>
  >();
  const mockOnChanged = vi.fn();

  let propertyResults: Record<string, [string, unknown][]>;
  let blocks: Record<string, unknown>;

  beforeEach(() => {
    propertyResults = {};
    blocks = {};

    __clearTagMappingCacheForTests();
    mockDatascriptQuery.mockReset();
    mockGetBlock.mockReset();
    mockOnChanged.mockReset();

    mockDatascriptQuery.mockImplementation(async (query: string) => {
      const key = Object.keys(propertyResults).find((candidate) => query.includes(`:${candidate}`));
      if (!key) {
        return [];
      }
      return propertyResults[key] ?? [];
    });

    mockGetBlock.mockImplementation(async (uuid: string) => {
      return blocks[uuid] ?? null;
    });

    mockOnChanged.mockImplementation(() => undefined);

    (globalThis as unknown as Record<string, unknown>).logseq = {
      DB: {
        datascriptQuery: mockDatascriptQuery,
        onChanged: mockOnChanged,
      },
      Editor: {
        getBlock: mockGetBlock,
      },
    };
  });

  it("extracts hashtag, tag links, and plain page links from content", () => {
    const result = extractTagsFromContent("TODO Draft #project-bar #[[Label Foo]] [[my-project]]");
    expect(result).toEqual(["project-bar", "Label Foo", "my-project"]);
  });

  it("formats tags for inline usage", () => {
    expect(formatTagReference("project-bar")).toBe("#project-bar");
    expect(formatTagReference("Project Foo")).toBe("#[[Project Foo]]");
  });

  it("resolves project and label mappings from tag metadata", async () => {
    propertyResults["todoist-project-id"] = [["uuid-project", "123456789"]];
    propertyResults["todoist-label-name"] = [["uuid-label", "urgent"]];
    blocks["uuid-project"] = { page: { originalName: "project-bar" } };
    blocks["uuid-label"] = { page: { originalName: "label-urgent" } };

    const content = "TODO Follow up #project-bar #label-urgent";
    const mapping = await resolveContentTagMappings(content);

    expect(mapping.project?.projectId).toBe("123456789");
    expect(mapping.labelSelections).toHaveLength(1);
    expect(mapping.labelSelections[0]).toMatchObject({
      tag: "label-urgent",
      labelNames: ["urgent"],
    });

    const projectTags = await lookupTagsForProject("123456789", "Project Bar");
    expect(projectTags).toEqual(["project-bar"]);

    const labelTags = await lookupTagsForLabels(["urgent-id"], ["urgent"]);
    expect(labelTags).toEqual(["label-urgent"]);
  });

  it("reports conflicting project tags", async () => {
    propertyResults["todoist-project-id"] = [
      ["uuid-project-1", "123"],
      ["uuid-project-2", "456"],
    ];
    blocks["uuid-project-1"] = { page: { originalName: "project-alpha" } };
    blocks["uuid-project-2"] = { page: { originalName: "project-beta" } };

    const result = await resolveContentTagMappings("TODO Blend #project-alpha #project-beta");
    expect(result.conflictingProjectTags).toEqual(["project-alpha", "project-beta"]);
  });
});
