import '@logseq/libs'

import { createRoot } from 'react-dom/client'

import { getAllLabels, getAllProjects } from './features/helpers'
import { parseQuery } from './features/query'
import { retrieveTasks, runQuery } from './features/retrieve'
import { insertTasksIntoGraph } from './features/retrieve/insert-tasks-into-graph'
import { sendTask } from './features/send'
import { SendTask } from './features/send/components/SendTask'
import handleListeners from './handleListeners'
import { callSettings } from './settings'

const main = async () => {
  console.log('logseq-todoist-plugin loaded')
  handleListeners()

  if (logseq.settings!.apiToken === '') {
    // Check if it's a new install
    await logseq.UI.showMsg(
      'Please key in your API key before using the plugin',
      'error',
    )
  }
  const projects = await getAllProjects()
  const labels = await getAllLabels()
  callSettings(projects, labels)

  // const templates = await logseq.App.getCurrentGraphTemplates()
  // console.log('Templates', templates)

  // RETRIEVE TASKS
  logseq.Editor.registerSlashCommand('Todoist: Retrieve Tasks', async (e) => {
    const msgKey = await logseq.UI.showMsg('Getting tasks...')
    const result = await retrieveTasks('default')
    logseq.UI.closeMsg(msgKey)
    if (result.blocks.length === 0) {
      await logseq.UI.showMsg('No tasks available for the default project.', 'warning')
      return
    }
    await insertTasksIntoGraph(result.blocks, e.uuid)
  })

  logseq.Editor.registerSlashCommand(
    "Todoist: Retrieve Today's Tasks",
    async (e) => {
      const msgKey = await logseq.UI.showMsg('Getting tasks...')
      const result = await retrieveTasks('today')
      logseq.UI.closeMsg(msgKey)
      if (result.blocks.length === 0) {
        await logseq.UI.showMsg('No tasks due today.', 'warning')
        return
      }
      await insertTasksIntoGraph(result.blocks, e.uuid, { title: 'Todoist · Today' })
    },
  )

  logseq.Editor.registerSlashCommand(
    'Todoist: Retrieve Custom Filter',
    async (e) => {
      const content = await logseq.Editor.getEditingBlockContent()
      if (content.trim().length === 0) {
        logseq.UI.showMsg('Cannot retrieve with empty filter', 'error')
        return
      }

      const parseResult = parseQuery(content)
      if (!parseResult.ok) {
        await logseq.UI.showMsg(parseResult.error, 'error')
        return
      }

      const msgKey = await logseq.UI.showMsg('Running Todoist query...')
      const result = await runQuery(parseResult.config)
      logseq.UI.closeMsg(msgKey)

      if (parseResult.warnings.length > 0) {
        await logseq.UI.showMsg(parseResult.warnings.join('\n'), 'warning')
      }

      if (result.blocks.length === 0) {
        await logseq.UI.showMsg('No tasks matched the query.', 'warning')
        return
      }

      await logseq.Editor.upsertBlockProperty(e.uuid, 'todoist_query', content)
      await insertTasksIntoGraph(result.blocks, e.uuid, { title: result.title })
    },
  )

  // SEND TASKS
  const el = document.getElementById('app')
  if (!el) return
  const root = createRoot(el)

  logseq.Editor.registerSlashCommand(
    'Todoist: Send Task (manual)',
    async (e) => {
      const content = await logseq.Editor.getEditingBlockContent()
      if (content.length === 0) {
        logseq.UI.showMsg('Unable to send empty task', 'error')
        return
      }
      const page = await logseq.Editor.getCurrentPage()
      const msgKey = await logseq.UI.showMsg(
        'Getting projects and labels',
        'success',
      )
      const allProjects = await getAllProjects()
      const allLabels = await getAllLabels()
      logseq.UI.closeMsg(msgKey)

      root.render(
        <SendTask
          key={e.uuid}
          content={content}
          projects={allProjects}
          labels={allLabels}
          uuid={e.uuid}
          pageName={(page?.originalName ?? page?.name) as string | undefined}
        />,
      )
      logseq.showMainUI()
    },
  )

  logseq.Editor.registerSlashCommand('Todoist: Send Task', async (e) => {
    const content = await logseq.Editor.getEditingBlockContent()
    if (content.length === 0) {
      logseq.UI.showMsg('Unable to send empty task', 'error')
      return
    }

    const page = await logseq.Editor.getCurrentPage()
    const pageName = (page?.originalName ?? page?.name) as string | undefined
    const includePageLink = Boolean(logseq.settings?.sendIncludePageLink)

    // If default project set, don't show popup
    if (logseq.settings!.sendDefaultProject !== '--- ---') {
      await sendTask(
        {
          task: content,
          project: logseq.settings!.sendDefaultProject as string,
          label: [logseq.settings!.sendDefaultLabel as string],
          due: logseq.settings!.sendDefaultDeadline ? 'today' : '',
          priority: '1',
          uuid: e.uuid,
          includePageLink,
        },
        { pageName },
      )
    } else {
      // If no default project set, show popup
      const msgKey = await logseq.UI.showMsg(
        'Getting projects and labels',
        'success',
      )
      const allProjects = await getAllProjects()
      const allLabels = await getAllLabels()
      logseq.UI.closeMsg(msgKey)

      root.render(
        <SendTask
          key={e.uuid}
          content={content}
          projects={allProjects}
          labels={allLabels}
          uuid={e.uuid}
          pageName={pageName}
        />,
      )
      logseq.showMainUI()
    }
  })
}

logseq.ready(main).catch(console.error)
