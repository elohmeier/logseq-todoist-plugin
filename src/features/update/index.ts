import { TodoistApi } from '@doist/todoist-api-typescript'

import {
  extractPriorityMarker,
  extractSchedulingMarkers,
  removeTaskFlags,
} from '../send'

const buildDescription = async (
  uuid: string,
  block: { page?: { id: string | number } } | null,
  includePageLink: boolean,
): Promise<string> => {
  const descriptionParts: string[] = []
  const graph = await logseq.App.getCurrentGraph()
  const graphName = graph?.name

  if (logseq.settings?.sendAppendUri && graphName) {
    descriptionParts.push(`[Open in Logseq](logseq://graph/${graphName}?block-id=${uuid})`)
  }

  if (includePageLink) {
    const page = block?.page?.id ? await logseq.Editor.getPage(block.page.id) : null
    const pageName = (page?.originalName ?? page?.name) as string | undefined
    if (pageName) {
      descriptionParts.push(`Page: [[${pageName}]]`)
    }
  }

  return descriptionParts.join('\n')
}

export const sanitizeBlockContent = (input: string): string => {
  const lines = input.split(/\n+/)
  const cleaned: string[] = []
  let inLogbook = false

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    if (trimmed.match(/^:LOGBOOK:/i)) {
      inLogbook = true
      continue
    }

    if (inLogbook) {
      if (trimmed.match(/^:END:/i)) {
        inLogbook = false
      }
      continue
    }

    if (trimmed.match(/^CLOCK:/i)) {
      continue
    }

    if (trimmed.match(/^todoistid::/i) || trimmed.match(/^todoist_url::/i)) {
      continue
    }

    cleaned.push(trimmed)
  }

  return cleaned.join('\n').trim()
}

export const updateTaskFromBlock = async (uuid: string) => {
  if (!logseq.settings || logseq.settings.apiToken === '') {
    await logseq.UI.showMsg('Invalid API token', 'error')
    return
  }

  const block = await logseq.Editor.getBlock(uuid, { includeChildren: false })
  if (!block) {
    await logseq.UI.showMsg('Unable to locate block', 'error')
    return
  }

  const todoistId = (block.properties as Record<string, string> | undefined)?.todoistid
  if (!todoistId) {
    await logseq.UI.showMsg('Block is not linked to a Todoist task', 'warning')
    return
  }

  const rawContent = (block.content ?? '').trim()
  if (rawContent.length === 0) {
    await logseq.UI.showMsg('Cannot update empty task', 'error')
    return
  }

  const api = new TodoistApi(logseq.settings.apiToken as string)

  const includePageLink = Boolean(logseq.settings.sendIncludePageLink)
  const description = await buildDescription(uuid, block, includePageLink)

  const sanitized = sanitizeBlockContent(rawContent)
  if (sanitized.length === 0) {
    await logseq.UI.showMsg('No task content available to sync', 'warning')
    return
  }

  const cleanedTask = removeTaskFlags(sanitized)
  const scheduling = extractSchedulingMarkers(cleanedTask)
  const priorityExtraction = extractPriorityMarker(scheduling.content)
  const content = priorityExtraction.content
  const scheduledDate = scheduling.scheduledDate
  const deadlineDate = scheduling.deadlineDate
  const markerPriority = priorityExtraction.priority

  const payload: Record<string, unknown> = {
    content,
    description,
  }

  if (scheduledDate) {
    payload.dueDate = scheduledDate
  } else {
    payload.dueDate = null
  }

  if (deadlineDate) {
    payload.deadlineDate = deadlineDate
  } else {
    payload.deadlineDate = null
  }

  if (markerPriority) {
    payload.priority = markerPriority
  }

  try {
    await api.updateTask(todoistId, payload as Parameters<TodoistApi['updateTask']>[1])
    const taskUrl = `todoist://task?id=${todoistId}`
    await logseq.Editor.upsertBlockProperty(uuid, 'todoist_url', taskUrl)
    await logseq.UI.showMsg('Todoist task updated', 'success', { timeout: 2000 })
  } catch (error) {
    console.error(error)
    await logseq.UI.showMsg(`Update failed: ${(error as Error).message}`, 'error')
  }
}
