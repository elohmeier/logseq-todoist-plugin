import { TodoistApi } from "@doist/todoist-api-typescript";

import { getIdFromString, getNameFromString } from "../helpers";
import { FormInput } from "./components/SendTask";

export const removeTaskFlags = (content: string): string => {
  const taskFlags = ["TODO", "DOING", "NOW", "LATER", "DONE"];
  for (const f of taskFlags) {
    if (content.includes(f)) {
      content = content.replace(f, "");
    }
  }
  return content;
};

const PRIORITY_REGEX = /\[#([A-D])]/i;
const SCHEDULED_REGEX = /^\s*SCHEDULED:\s*<(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/i;
const DEADLINE_REGEX = /^\s*DEADLINE:\s*<(\d{4})-(\d{2})-(\d{2})/i;

const PRIORITY_TO_TODOIST: Record<string, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

const TODOIST_PRIORITY_TO_MARKER: Record<number, string> = {
  4: "A",
  3: "B",
  2: "C",
};

export const extractSchedulingMarkers = (content: string) => {
  let scheduledDate: string | null = null;
  let deadlineDate: string | null = null;
  const cleanedLines: string[] = [];

  for (const line of content.split(/\n+/)) {
    const trimmed = line.trimEnd();
    const scheduledMatch = trimmed.match(SCHEDULED_REGEX);
    if (scheduledMatch) {
      const [, year, month, day] = scheduledMatch;
      scheduledDate = `${year}-${month}-${day}`;
      continue;
    }

    const deadlineMatch = trimmed.match(DEADLINE_REGEX);
    if (deadlineMatch) {
      const [, year, month, day] = deadlineMatch;
      deadlineDate = `${year}-${month}-${day}`;
      continue;
    }
    cleanedLines.push(trimmed);
  }

  const cleanedContent = cleanedLines.join("\n").trim();
  return {
    content: cleanedContent.length > 0 ? cleanedContent : content.trim(),
    scheduledDate,
    deadlineDate,
  };
};

export const extractPriorityMarker = (content: string) => {
  let detected: number | null = null;
  const updated = content.replace(PRIORITY_REGEX, (_, marker: string) => {
    const upper = marker.toUpperCase();
    detected = PRIORITY_TO_TODOIST[upper] ?? null;
    return "";
  });

  return {
    content: updated.trim(),
    priority: detected,
  };
};

export const todoistPriorityToMarker = (priority: number): string | null => {
  return TODOIST_PRIORITY_TO_MARKER[priority] ?? null;
};

export const resolveTaskContent = (
  editingContent: string | null | undefined,
  blockContent: string | null | undefined,
): string => {
  const candidate = typeof editingContent === "string" ? editingContent : "";
  if (candidate.trim().length > 0) {
    return candidate;
  }

  const fallback = typeof blockContent === "string" ? blockContent : "";
  if (fallback.trim().length > 0) {
    return fallback;
  }

  return "";
};

export interface SendTaskResolutionInput {
  task: string;
  priority?: string;
  dueString?: string;
  scheduledDate?: string;
  deadlineDate?: string;
}

export interface ResolvedTaskOptions {
  content: string;
  priority?: number;
  dueDate?: string;
  dueString?: string;
  deadlineDate?: string;
}

export const resolveSendTaskOptions = ({
  task,
  priority,
  dueString,
  scheduledDate,
  deadlineDate,
}: SendTaskResolutionInput): ResolvedTaskOptions => {
  const cleanedTask = removeTaskFlags(task);
  const schedulingFromContent = extractSchedulingMarkers(cleanedTask);
  const priorityExtraction = extractPriorityMarker(schedulingFromContent.content);
  const finalContent = priorityExtraction.content;
  const markerPriority = priorityExtraction.priority;

  const normalizedPriority = priority?.toString().trim() ?? "";
  const manualPriority =
    normalizedPriority !== "" ? Number.parseInt(normalizedPriority, 10) : undefined;
  const resolvedPriority =
    manualPriority && Number.isFinite(manualPriority) ? manualPriority : markerPriority ?? undefined;

  const hasScheduledOverride = typeof scheduledDate !== "undefined";
  const manualScheduled = (scheduledDate ?? "").trim();
  const resolvedScheduledDate = hasScheduledOverride
    ? manualScheduled === ""
      ? undefined
      : manualScheduled
    : schedulingFromContent.scheduledDate ?? undefined;

  const hasDeadlineOverride = typeof deadlineDate !== "undefined";
  const manualDeadline = (deadlineDate ?? "").trim();
  const resolvedDeadlineDate = hasDeadlineOverride
    ? manualDeadline === ""
      ? undefined
      : manualDeadline
    : schedulingFromContent.deadlineDate ?? undefined;

  const hasDueOverride = typeof dueString !== "undefined";
  const manualDue = (dueString ?? "").trim();
  const resolvedDueString = hasDueOverride ? manualDue : "";

  const result: ResolvedTaskOptions = {
    content: finalContent,
  };

  if (resolvedPriority && Number.isFinite(resolvedPriority)) {
    result.priority = resolvedPriority;
  }

  if (resolvedScheduledDate) {
    result.dueDate = resolvedScheduledDate;
  } else if (resolvedDueString !== "") {
    result.dueString = resolvedDueString;
  }

  if (resolvedDeadlineDate) {
    result.deadlineDate = resolvedDeadlineDate;
  }

  return result;
};

export const sendTask = async (
  {
    task,
    project,
    label,
    priority,
    dueString,
    scheduledDate,
    deadlineDate,
    uuid,
    includePageLink,
  }: FormInput,
  options?: { pageName?: string },
) => {
  if (logseq.settings!.apiToken === "") {
    logseq.UI.showMsg("Invalid API token", "error");
    return;
  }

  const api = new TodoistApi(logseq.settings!.apiToken as string);

  const currGraph = await logseq.App.getCurrentGraph();
  const currGraphName = currGraph?.name;

  const descriptionParts: string[] = [];
  if (logseq.settings!.sendAppendUri) {
    descriptionParts.push(`[Open in Logseq](logseq://graph/${currGraphName}?block-id=${uuid})`);
  }

  if (includePageLink && options?.pageName) {
    descriptionParts.push(`Page: [[${options.pageName}]]`);
  }

  const resolved = resolveSendTaskOptions({
    task,
    priority,
    dueString,
    scheduledDate,
    deadlineDate,
  });

  const sendObj: Parameters<TodoistApi["addTask"]>[0] = {
    content: resolved.content,
    description: descriptionParts.join("\n"),
    ...(project !== "--- ---" ? { projectId: getIdFromString(project) } : {}),
    ...(label.length > 0 && label[0] !== "--- ---"
      ? { labels: label.map((l) => getNameFromString(l)) }
      : {}),
    ...(typeof resolved.priority === "number" ? { priority: resolved.priority } : {}),
    ...(resolved.dueDate
      ? { dueDate: resolved.dueDate }
      : resolved.dueString
      ? { dueString: resolved.dueString }
      : {}),
    ...(resolved.deadlineDate ? { deadlineDate: resolved.deadlineDate } : {}),
  };

  try {
    const res = await api.addTask(sendObj);
    const taskUrl = `todoist://task?id=${res.id}`;
    await logseq.Editor.upsertBlockProperty(uuid, "todoistid", res.id);
    await logseq.Editor.upsertBlockProperty(uuid, "todoist-url", taskUrl);
    logseq.UI.showMsg("Task sent successfully", "success", { timeout: 3000 });
    return res;
  } catch (error) {
    console.error(error);
    await logseq.UI.showMsg(`Task was not sent: ${(error as Error).message}`);
  }
};
