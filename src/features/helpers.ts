import { Label, PersonalProject, TodoistApi, WorkspaceProject } from "@doist/todoist-api-typescript";

type Project = PersonalProject | WorkspaceProject;

export const collectPaginatedResults = async <T>(
  fetchPage: (cursor?: string) => Promise<{ results: T[]; nextCursor: string | null }>,
) => {
  const items: T[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const { results, nextCursor } = await fetchPage(cursor ?? undefined);
    items.push(...results);
    cursor = nextCursor;
  } while (cursor);

  return items;
};

export const getAllProjects = async (): Promise<string[]> => {
  const { apiToken } = logseq.settings!;
  if (!apiToken || apiToken === "") return ["--- ---"];
  const api: TodoistApi = new TodoistApi(apiToken as string);
  try {
    const allProjects: Project[] = await collectPaginatedResults<Project>(
      async (cursor) => api.getProjects(cursor ? { cursor } : undefined),
    );
    const projArr = allProjects.map(
      (project) => `${project.name} (${project.id})`,
    );
    projArr.unshift("--- ---");
    return projArr;
  } catch (e) {
    console.log(e);
    await logseq.UI.showMsg(
      `Error retrieving projects ${(e as Error).message}`,
      "error",
    );
    return ["--- ---"];
  }
};

export const getAllLabels = async (): Promise<string[]> => {
  const { apiToken } = logseq.settings!;
  if (!apiToken || apiToken === "") return ["--- ---"];
  const api: TodoistApi = new TodoistApi(apiToken as string);
  try {
    const allLabels: Label[] = await collectPaginatedResults<Label>(
      async (cursor) => api.getLabels(cursor ? { cursor } : undefined),
    );
    const labelArr = allLabels.map((label) => `${label.name} (${label.id})`);
    labelArr.unshift("--- ---");
    return labelArr;
  } catch (e) {
    console.log(e);
    await logseq.UI.showMsg(
      `Error retrieving labels ${(e as Error).message}`,
      "error",
    );
    return ["--- ---"];
  }
};

export const getIdFromString = (content: string): string => {
  const regExp = /\((.*?)\)/;
  const matched = regExp.exec(content.trim());
  if (matched && matched[1]) {
    return matched[1];
  } else {
    return "";
  }
};

export const getNameFromString = (content: string): string => {
  return content.substring(0, content.indexOf("(")).trim();
};
