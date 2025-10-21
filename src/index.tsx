import "@logseq/libs";

import { createRoot } from "react-dom/client";

import { getAllLabels, getAllProjects } from "./features/helpers";
import { parseQuery } from "./features/query";
import { retrieveTasks, runQuery } from "./features/retrieve";
import { insertTasksIntoGraph } from "./features/retrieve/insert-tasks-into-graph";
import { resolveTaskContent, sendTask } from "./features/send";
import { SendTask } from "./features/send/components/SendTask";
import { initializeTagMappingCache } from "./features/tag-mapping";
import { updateTaskFromBlock, UpdateTaskResult } from "./features/update";
import handleListeners from "./handleListeners";
import { callSettings } from "./settings";

const main = async () => {
  console.log("logseq-todoist-plugin loaded");
  handleListeners();
  initializeTagMappingCache();

  if (logseq.settings!.apiToken === "") {
    // Check if it's a new install
    await logseq.UI.showMsg(
      "Please key in your API key before using the plugin",
      "error",
    );
  }
  const projects = await getAllProjects();
  const labels = await getAllLabels();
  callSettings(projects, labels);

  // const templates = await logseq.App.getCurrentGraphTemplates()
  // console.log('Templates', templates)

  // RETRIEVE TASKS
  logseq.Editor.registerSlashCommand("Todoist: Retrieve Tasks", async (e) => {
    const msgKey = await logseq.UI.showMsg("Getting tasks...");
    const result = await retrieveTasks("default");
    logseq.UI.closeMsg(msgKey);
    if (result.blocks.length === 0) {
      await logseq.UI.showMsg("No tasks available for the default project.", "warning");
      return;
    }
    await insertTasksIntoGraph(result.blocks, e.uuid);
  });

  logseq.Editor.registerSlashCommand(
    "Todoist: Retrieve Today's Tasks",
    async (e) => {
      const msgKey = await logseq.UI.showMsg("Getting tasks...");
      const result = await retrieveTasks("today");
      logseq.UI.closeMsg(msgKey);
      if (result.blocks.length === 0) {
        await logseq.UI.showMsg("No tasks due today.", "warning");
        return;
      }
      await insertTasksIntoGraph(result.blocks, e.uuid, { title: "Todoist · Today" });
    },
  );

  logseq.Editor.registerSlashCommand(
    "Todoist: Retrieve Custom Filter",
    async (e) => {
      const content = await logseq.Editor.getEditingBlockContent();
      if (content.trim().length === 0) {
        logseq.UI.showMsg("Cannot retrieve with empty filter", "error");
        return;
      }

      const parseResult = parseQuery(content);
      if (!parseResult.ok) {
        await logseq.UI.showMsg(parseResult.error, "error");
        return;
      }

      const msgKey = await logseq.UI.showMsg("Running Todoist query...");
      const result = await runQuery(parseResult.config);
      logseq.UI.closeMsg(msgKey);

      if (parseResult.warnings.length > 0) {
        await logseq.UI.showMsg(parseResult.warnings.join("\n"), "warning");
      }

      if (result.blocks.length === 0) {
        await logseq.UI.showMsg("No tasks matched the query.", "warning");
        return;
      }

      await logseq.Editor.upsertBlockProperty(e.uuid, "todoist_query", content);
      await insertTasksIntoGraph(result.blocks, e.uuid, { title: result.title });
    },
  );

  // SEND TASKS
  const el = document.getElementById("app");
  if (!el) return;
  const root = createRoot(el);

  const syncTaskForBlock = async (
    uuid: string,
    options?: { forceManual?: boolean; skipUpdate?: boolean },
  ) => {
    if (!logseq.settings || logseq.settings.apiToken === "") {
      await logseq.UI.showMsg("Invalid API token", "error");
      return;
    }

    const block = await logseq.Editor.getBlock(uuid, { includeChildren: false });
    if (!block) {
      await logseq.UI.showMsg("Unable to locate block", "error");
      return;
    }

    const todoistId = (block.properties as Record<string, string> | undefined)?.todoistid;
    if (!options?.skipUpdate && todoistId) {
      const result: UpdateTaskResult = await updateTaskFromBlock(uuid);
      if (result === "deleted") {
        await syncTaskForBlock(uuid, { forceManual: true, skipUpdate: true });
      }
      return;
    }

    const editingContent = await logseq.Editor.getEditingBlockContent();
    const resolvedContent = resolveTaskContent(editingContent, block.content);
    if (resolvedContent.trim().length === 0) {
      await logseq.UI.showMsg("Unable to send empty task", "error");
      return;
    }

    const page = await logseq.Editor.getCurrentPage();
    const pageName = (page?.originalName ?? page?.name) as string | undefined;
    const includePageLink = Boolean(logseq.settings?.sendIncludePageLink);

    if (!options?.forceManual && logseq.settings!.sendDefaultProject !== "--- ---") {
      await sendTask(
        {
          task: resolvedContent,
          project: logseq.settings!.sendDefaultProject as string,
          label: [logseq.settings!.sendDefaultLabel as string],
          dueString: "",
          priority: "",
          scheduledDate: undefined,
          deadlineDate: undefined,
          uuid,
          includePageLink,
        },
        { pageName, allowTagOverrides: true },
      );
      return;
    }

    const msgKey = await logseq.UI.showMsg(
      "Getting projects and labels",
      "success",
    );
    const allProjects = await getAllProjects();
    const allLabels = await getAllLabels();
    logseq.UI.closeMsg(msgKey);

    root.render(
      <SendTask
        key={uuid}
        content={resolvedContent}
        projects={allProjects}
        labels={allLabels}
        uuid={uuid}
        pageName={pageName}
      />,
    );
    logseq.showMainUI();
  };

  logseq.Editor.registerSlashCommand("Todoist: Sync Task", async (e) => {
    await syncTaskForBlock(e.uuid);
  });

  logseq.Editor.registerSlashCommand(
    "Todoist: Send Task (manual)",
    async (e) => {
      await syncTaskForBlock(e.uuid, { forceManual: true });
    },
  );
};

logseq.ready(main).catch(console.error);
