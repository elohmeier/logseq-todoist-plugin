import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

const PROJECT_ID_KEYS = [
  "todoist-project-id",
  "todoist_project_id",
  "todoist-projectid",
  "todoist_projectid",
];

const PROJECT_NAME_KEYS = [
  "todoist-project-name",
  "todoist_project_name",
  "todoist-project",
  "todoist_project",
];

const LABEL_ID_KEYS = [
  "todoist-label-id",
  "todoist_label_id",
  "todoist-label-ids",
  "todoist_label_ids",
];

const LABEL_NAME_KEYS = [
  "todoist-label-name",
  "todoist_label_name",
  "todoist-label",
  "todoist_label",
  "todoist-labels",
  "todoist_labels",
];

interface AggregatedTagData {
  tag: string;
  projectIds: Set<string>;
  projectNames: Set<string>;
  labelIds: Set<string>;
  labelNames: Set<string>;
}

interface TagMappingMetadata {
  tag: string;
  projectIds: string[];
  projectNames: string[];
  labelIds: string[];
  labelNames: string[];
}

export interface ProjectTagSelection {
  tag: string;
  projectId?: string;
  projectName?: string;
}

export interface LabelTagSelection {
  tag: string;
  labelIds: string[];
  labelNames: string[];
}

export interface ContentTagMappingResult {
  rawTags: string[];
  project?: ProjectTagSelection;
  conflictingProjectTags: string[];
  labelSelections: LabelTagSelection[];
  warnings: string[];
}

const tagMetadataCache = new Map<string, TagMappingMetadata>();
const projectIdToTags = new Map<string, Set<string>>();
const projectNameToTags = new Map<string, Set<string>>();
const labelIdToTags = new Map<string, Set<string>>();
const labelNameToTags = new Map<string, Set<string>>();

let initialized = false;
let needsRefresh = true;
let refreshPromise: Promise<void> | null = null;

const TAG_REGEX = /#\[\[([^\]]+?)]]|#([^\s#]+)|\[\[([^\]]+?)]]/g;

const normalizeValue = (value: unknown): string[] => {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeValue(item));
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  return [];
};

const addToIndex = (map: Map<string, Set<string>>, key: string, tag: string) => {
  if (key.trim().length === 0) return;
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key)!.add(tag);
};

const ensureTagEntry = (
  aggregate: Map<string, AggregatedTagData>,
  tag: string,
): AggregatedTagData => {
  if (!aggregate.has(tag)) {
    aggregate.set(tag, {
      tag,
      projectIds: new Set<string>(),
      projectNames: new Set<string>(),
      labelIds: new Set<string>(),
      labelNames: new Set<string>(),
    });
  }
  return aggregate.get(tag)!;
};

const extractPageName = (entity: BlockEntity | PageEntity | null): string | null => {
  if (!entity) {
    return null;
  }

  const candidateOriginal = (entity as { originalName?: string }).originalName;
  if (typeof candidateOriginal === "string" && candidateOriginal.trim().length > 0) {
    return candidateOriginal.trim();
  }

  const candidateName = (entity as { name?: string }).name;
  if (typeof candidateName === "string" && candidateName.trim().length > 0) {
    return candidateName.trim();
  }

  const block = entity as BlockEntity;
  const pageInfo = block.page as PageEntity | undefined;
  if (pageInfo) {
    if (typeof pageInfo.originalName === "string" && pageInfo.originalName.trim().length > 0) {
      return pageInfo.originalName.trim();
    }
    if (typeof pageInfo.name === "string" && pageInfo.name.trim().length > 0) {
      return pageInfo.name.trim();
    }
  }

  return null;
};

const queryPropertyRows = async (
  propertyKey: string,
): Promise<{ uuid: string; value: unknown }[]> => {
  const key = propertyKey.trim();
  if (key.length === 0) {
    return [];
  }

  const query = `
[:find ?uuid ?value
 :where
  [?b :block/uuid ?uuid]
  [?b :block/properties ?props]
  [(get ?props :${key}) ?value]
 ]
`;

  const rows = (await logseq.DB.datascriptQuery(query)) as [string, unknown][] | null;
  if (!rows) {
    return [];
  }

  return rows
    .map(([uuid, value]) => ({ uuid, value }))
    .filter((row): row is { uuid: string; value: unknown } => typeof row.uuid === "string");
};

const buildAggregatedMappings = async () => {
  const aggregate = new Map<string, AggregatedTagData>();
  const blockCache = new Map<string, BlockEntity | PageEntity | null>();

  const processRows = async (
    propertyKeys: string[],
    apply: (entry: AggregatedTagData, values: string[]) => void,
  ) => {
    for (const propertyKey of propertyKeys) {
      const rows = await queryPropertyRows(propertyKey);
      if (rows.length === 0) {
        continue;
      }

      const uniqueUuids = Array.from(new Set(rows.map((row) => row.uuid)));
      await Promise.all(
        uniqueUuids.map(async (uuid) => {
          if (blockCache.has(uuid)) {
            return;
          }

          let entity: BlockEntity | PageEntity | null = null;
          try {
            entity = (await logseq.Editor.getBlock(uuid, { includeChildren: false })) as BlockEntity | null;
          } catch {
            // ignore lookup failures
          }

          let resolvedName = extractPageName(entity);

          if (!resolvedName && entity && "page" in entity && entity.page && typeof entity.page === "object") {
            const pageId = (entity.page as { id?: string | number }).id;
            if (pageId !== undefined) {
              try {
                const page = (await logseq.Editor.getPage(pageId)) as PageEntity | null;
                if (page) {
                  resolvedName = extractPageName(page);
                  if (resolvedName) {
                    entity = page;
                  }
                }
              } catch {
                // ignore lookup failures
              }
            }
          }

          if (!resolvedName && (!entity || typeof uuid === "string")) {
            try {
              const page = (await logseq.Editor.getPage(uuid)) as PageEntity | null;
              if (page) {
                const candidate = extractPageName(page);
                if (candidate) {
                  resolvedName = candidate;
                  entity = page;
                }
              }
            } catch {
              // ignore lookup failures
            }
          }

          blockCache.set(uuid, entity);
        }),
      );

      for (const row of rows) {
        const entity = blockCache.get(row.uuid) ?? null;
        const pageName = extractPageName(entity);
        if (!pageName) {
          continue;
        }
        const values = normalizeValue(row.value);
        if (values.length === 0) {
          continue;
        }
        const entry = ensureTagEntry(aggregate, pageName);
        apply(entry, values);
      }
    }
  };

  await processRows(PROJECT_ID_KEYS, (entry, values) => {
    values.forEach((value) => entry.projectIds.add(value));
  });

  await processRows(PROJECT_NAME_KEYS, (entry, values) => {
    values.forEach((value) => entry.projectNames.add(value));
  });

  await processRows(LABEL_ID_KEYS, (entry, values) => {
    values.forEach((value) => entry.labelIds.add(value));
  });

  await processRows(LABEL_NAME_KEYS, (entry, values) => {
    values.forEach((value) => entry.labelNames.add(value));
  });

  return aggregate;
};

const refreshMappingsIndex = async () => {
  needsRefresh = false;
  tagMetadataCache.clear();
  projectIdToTags.clear();
  projectNameToTags.clear();
  labelIdToTags.clear();
  labelNameToTags.clear();

  try {
    const aggregate = await buildAggregatedMappings();
    aggregate.forEach((entry) => {
      const metadata: TagMappingMetadata = {
        tag: entry.tag,
        projectIds: Array.from(entry.projectIds).map((id) => id.trim()).filter((id) => id.length > 0),
        projectNames: Array.from(entry.projectNames)
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
        labelIds: Array.from(entry.labelIds).map((id) => id.trim()).filter((id) => id.length > 0),
        labelNames: Array.from(entry.labelNames)
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
      };

      if (
        metadata.projectIds.length === 0
        && metadata.projectNames.length === 0
        && metadata.labelIds.length === 0
        && metadata.labelNames.length === 0
      ) {
        return;
      }

      tagMetadataCache.set(metadata.tag, metadata);

      metadata.projectIds.forEach((projectId) => addToIndex(projectIdToTags, projectId, metadata.tag));
      metadata.projectNames.forEach((projectName) =>
        addToIndex(projectNameToTags, projectName.toLowerCase(), metadata.tag)
      );
      metadata.labelIds.forEach((labelId) => addToIndex(labelIdToTags, labelId, metadata.tag));
      metadata.labelNames.forEach((labelName) =>
        addToIndex(labelNameToTags, labelName.toLowerCase(), metadata.tag)
      );
    });
  } catch (error) {
    console.error("[logseq-todoist-plugin] Failed to refresh tag mappings", error);
  }
};

const ensureIndex = async () => {
  if (!needsRefresh) {
    return;
  }

  if (!refreshPromise) {
    refreshPromise = refreshMappingsIndex();
    await refreshPromise;
    refreshPromise = null;
  } else {
    await refreshPromise;
  }
};

const markDirty = () => {
  needsRefresh = true;
  refreshPromise = null;
};

export const initializeTagMappingCache = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  logseq.DB.onChanged(() => {
    markDirty();
  });

  markDirty();
};

export const extractTagsFromContent = (content: string | null | undefined): string[] => {
  if (!content) return [];

  const seen = new Set<string>();
  const tags: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = TAG_REGEX.exec(content)) !== null) {
    const bracketed = match[1] ?? match[3];
    const simple = match[2];

    const raw = bracketed ?? simple ?? "";
    let normalized = raw.trim();
    if (normalized.length === 0) continue;

    normalized = normalized.replace(/[)\]}.,;:!?]+$/, "");

    if (!seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
  }

  return tags;
};

export const resolveContentTagMappings = async (
  content: string,
): Promise<ContentTagMappingResult> => {
  await ensureIndex();

  const tags = extractTagsFromContent(content);
  if (tags.length === 0) {
    return {
      rawTags: [],
      labelSelections: [],
      conflictingProjectTags: [],
      warnings: [],
    };
  }

  const projectCandidates: { metadata: TagMappingMetadata; tag: string }[] = [];
  const labelSelections: LabelTagSelection[] = [];
  const warnings: string[] = [];

  tags.forEach((tag) => {
    const metadata = tagMetadataCache.get(tag);
    if (!metadata) {
      return;
    }

    if (metadata.projectIds.length > 1) {
      warnings.push(
        `Tag #${tag} references multiple Todoist project IDs (${metadata.projectIds.join(
          ", ",
        )}). Using the first value.`,
      );
    }

    if (metadata.projectNames.length > 1) {
      warnings.push(
        `Tag #${tag} references multiple Todoist project names (${metadata.projectNames.join(
          ", ",
        )}). Using the first value.`,
      );
    }

    if (metadata.projectIds.length > 0 || metadata.projectNames.length > 0) {
      projectCandidates.push({ metadata, tag });
    }

    if (metadata.labelIds.length > 1) {
      warnings.push(
        `Tag #${tag} references multiple Todoist label IDs (${metadata.labelIds.join(
          ", ",
        )}). Using all values.`,
      );
    }

    if (metadata.labelNames.length > 1) {
      warnings.push(
        `Tag #${tag} references multiple Todoist label names (${metadata.labelNames.join(
          ", ",
        )}). Using all values.`,
      );
    }

    if (metadata.labelIds.length === 0 && metadata.labelNames.length === 0) {
      return;
    }

    labelSelections.push({
      tag,
      labelIds: metadata.labelIds,
      labelNames: metadata.labelNames,
    });
  });

  const conflictingProjectTags: string[] = [];
  let selectedProject: ProjectTagSelection | undefined;

  if (projectCandidates.length > 1) {
    const uniqueProjectIds = new Set<string>();
    projectCandidates.forEach(({ metadata }) => {
      metadata.projectIds.forEach((id) => uniqueProjectIds.add(id));
    });

    if (uniqueProjectIds.size > 1) {
      conflictingProjectTags.push(...projectCandidates.map((candidate) => candidate.tag));
    }
  }

  if (projectCandidates.length > 0 && conflictingProjectTags.length === 0) {
    const first = projectCandidates[0]!;
    const projectId = first.metadata.projectIds[0];
    const projectName = first.metadata.projectNames[0];

    if (!projectId && !projectName) {
      warnings.push(
        `Tag #${first.tag} is marked as a Todoist project link but is missing project metadata.`,
      );
    } else {
      selectedProject = {
        tag: first.tag,
        projectId,
        projectName,
      };
    }
  }

  return {
    rawTags: tags,
    project: selectedProject,
    conflictingProjectTags,
    labelSelections,
    warnings,
  };
};

const normalizeTagsFromIndex = (tags: Set<string> | undefined): string[] => {
  if (!tags) return [];
  return Array.from(tags).filter((tag) => tag.trim().length > 0);
};

export const lookupTagsForProject = async (
  projectId: string | null | undefined,
  projectName?: string | null,
): Promise<string[]> => {
  if (!projectId && !projectName) {
    return [];
  }

  await ensureIndex();

  const tags = projectId ? normalizeTagsFromIndex(projectIdToTags.get(projectId)) : [];
  if (tags.length > 0) {
    return tags;
  }

  if (projectName) {
    const normalized = projectName.trim().toLowerCase();
    return normalizeTagsFromIndex(projectNameToTags.get(normalized));
  }

  return [];
};

export const lookupTagsForLabels = async (
  labelIds: string[] | undefined,
  labelNames: string[] | undefined,
): Promise<string[]> => {
  await ensureIndex();

  const collected = new Set<string>();

  labelIds?.forEach((id) => {
    normalizeTagsFromIndex(labelIdToTags.get(id)).forEach((tag) => collected.add(tag));
  });

  labelNames?.forEach((name) => {
    const normalized = name.trim().toLowerCase();
    normalizeTagsFromIndex(labelNameToTags.get(normalized)).forEach((tag) => collected.add(tag));
  });

  return Array.from(collected);
};

export const formatTagReference = (tag: string): string => {
  const trimmed = tag.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (/[ \t/]/.test(trimmed)) {
    return `#[[${trimmed}]]`;
  }

  return `#${trimmed}`;
};

export const __clearTagMappingCacheForTests = () => {
  tagMetadataCache.clear();
  projectIdToTags.clear();
  projectNameToTags.clear();
  labelIdToTags.clear();
  labelNameToTags.clear();
  needsRefresh = true;
  refreshPromise = null;
};
