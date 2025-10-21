import { TodoistApi, TodoistRequestError } from "@doist/todoist-api-typescript";

import { extractPriorityMarker, extractSchedulingMarkers, removeTaskFlags } from "../send";
import { resolveContentTagMappings } from "../tag-mapping";

const buildDescription = async (
  uuid: string,
  block: { page?: { id: string | number } } | null,
  includePageLink: boolean,
): Promise<string> => {
  const descriptionParts: string[] = [];
  const graph = await logseq.App.getCurrentGraph();
  const graphName = graph?.name;

  if (logseq.settings?.sendAppendUri && graphName) {
    descriptionParts.push(`[Open in Logseq](logseq://graph/${graphName}?block-id=${uuid})`);
  }

  if (includePageLink) {
    const page = block?.page?.id ? await logseq.Editor.getPage(block.page.id) : null;
    const pageName = (page?.originalName ?? page?.name) as string | undefined;
    if (pageName) {
      descriptionParts.push(`Page: [[${pageName}]]`);
    }
  }

  return descriptionParts.join("\n");
};

export const sanitizeBlockContent = (input: string): string => {
  const lines = input.split(/\n+/);
  const cleaned: string[] = [];
  let inLogbook = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.match(/^:LOGBOOK:/i)) {
      inLogbook = true;
      continue;
    }

    if (inLogbook) {
      if (trimmed.match(/^:END:/i)) {
        inLogbook = false;
      }
      continue;
    }

    if (trimmed.match(/^CLOCK:/i)) {
      continue;
    }

    if (trimmed.match(/^todoistid::/i) || trimmed.match(/^todoist[-_]url::/i)) {
      continue;
    }

    cleaned.push(trimmed);
  }

  return cleaned.join("\n").trim();
};

export type UpdateTaskResult =
  | "updated"
  | "invalid-token"
  | "missing-block"
  | "not-linked"
  | "empty"
  | "no-content"
  | "deleted"
  | "error";

export const updateTaskFromBlock = async (uuid: string): Promise<UpdateTaskResult> => {
  if (!logseq.settings || logseq.settings.apiToken === "") {
    await logseq.UI.showMsg("Invalid API token", "error");
    return "invalid-token";
  }

  const block = await logseq.Editor.getBlock(uuid, { includeChildren: false });
  if (!block) {
    await logseq.UI.showMsg("Unable to locate block", "error");
    return "missing-block";
  }

  const todoistId = (block.properties as Record<string, string> | undefined)?.todoistid;
  if (!todoistId) {
    await logseq.UI.showMsg("Block is not linked to a Todoist task", "warning");
    return "not-linked";
  }

  const rawContent = (block.content ?? "").trim();
  if (rawContent.length === 0) {
    await logseq.UI.showMsg("Cannot update empty task", "error");
    return "empty";
  }

  const api = new TodoistApi(logseq.settings.apiToken as string);

  const includePageLink = Boolean(logseq.settings.sendIncludePageLink);
  const description = await buildDescription(uuid, block, includePageLink);

  const sanitized = sanitizeBlockContent(rawContent);
  if (sanitized.length === 0) {
    await logseq.UI.showMsg("No task content available to sync", "warning");
    return "no-content";
  }

  const cleanedTask = removeTaskFlags(sanitized);
  const tagMapping = await resolveContentTagMappings(sanitized);
  if (tagMapping.conflictingProjectTags.length > 0) {
    await logseq.UI.showMsg(
      `Multiple project tags detected (${tagMapping.conflictingProjectTags
        .map((tag) => `#${tag}`)
        .join(", ")}). Resolve the conflict before updating.`,
      "error",
    );
    return "error";
  }

  const scheduling = extractSchedulingMarkers(cleanedTask);
  const priorityExtraction = extractPriorityMarker(scheduling.content);
  const content = priorityExtraction.content;
  const scheduledDate = scheduling.scheduledDate;
  const deadlineDate = scheduling.deadlineDate;
  const markerPriority = priorityExtraction.priority;

  const payload: Record<string, unknown> = {
    content,
    description,
  };

  if (scheduledDate) {
    payload.dueDate = scheduledDate;
  } else {
    payload.dueDate = null;
  }

  if (deadlineDate) {
    payload.deadlineDate = deadlineDate;
  } else {
    payload.deadlineDate = null;
  }

  if (markerPriority) {
    payload.priority = markerPriority;
  }

  const warnings = [...tagMapping.warnings];

  if (tagMapping.project) {
    if (tagMapping.project.projectId) {
      payload.projectId = tagMapping.project.projectId;
    } else if (tagMapping.project.projectName) {
      warnings.push(
        `Tag #${tagMapping.project.tag} is missing a todoist-project-id:: value. Provide the project ID to sync it.`,
      );
    } else {
      warnings.push(`Tag #${tagMapping.project.tag} is marked for Todoist project mapping but lacks metadata.`);
    }
  }

  const labelNames = new Set<string>();
  tagMapping.labelSelections.forEach((selection) => {
    if (selection.labelNames.length === 0 && selection.labelIds.length > 0) {
      warnings.push(
        `Tag #${selection.tag} only specifies Todoist label IDs. Add todoist-label or todoist-label-name to sync by name.`,
      );
    }
    selection.labelNames.forEach((name) => {
      if (name.trim().length === 0) return;
      labelNames.add(name.trim());
    });
  });

  if (labelNames.size > 0) {
    payload.labels = Array.from(labelNames);
  }

  try {
    await api.updateTask(todoistId, payload as Parameters<TodoistApi["updateTask"]>[1]);
    const taskUrl = `todoist://task?id=${todoistId}`;
    await logseq.Editor.upsertBlockProperty(uuid, "todoist-url", taskUrl);
    if (warnings.length > 0) {
      await logseq.UI.showMsg(warnings.join("\n"), "warning");
    }
    await logseq.UI.showMsg("Todoist task updated", "success", { timeout: 2000 });
    return "updated";
  } catch (error) {
    console.error(error);
    if (error instanceof TodoistRequestError && error.httpStatusCode === 404) {
      await logseq.Editor.removeBlockProperty(uuid, "todoistid");
      await logseq.Editor.removeBlockProperty(uuid, "todoist-url");
      await logseq.UI.showMsg(
        "Todoist task no longer exists. Link removed so you can recreate it.",
        "warning",
        { timeout: 3000 },
      );
      return "deleted";
    }
    await logseq.UI.showMsg(`Update failed: ${(error as Error).message}`, "error");
    return "error";
  }
};
