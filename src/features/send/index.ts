import { TodoistApi } from '@doist/todoist-api-typescript'

import { getIdFromString, getNameFromString } from '../helpers'
import { FormInput } from './components/SendTask'

export const removeTaskFlags = (content: string): string => {
  const taskFlags = ['TODO', 'DOING', 'NOW', 'LATER', 'DONE']
  for (const f of taskFlags) {
    if (content.includes(f)) {
      content = content.replace(f, '')
    }
  }
  return content
}

const DEADLINE_REGEX = /^\s*DEADLINE:\s*<(\d{4})-(\d{2})-(\d{2})/i

export const extractDeadline = (content: string) => {
  let deadlineDate: string | null = null
  const cleanedLines: string[] = []

  for (const line of content.split(/\n+/)) {
    const trimmed = line.trimEnd()
    const match = trimmed.match(DEADLINE_REGEX)
    if (match) {
      const [, year, month, day] = match
      deadlineDate = `${year}-${month}-${day}`
      continue
    }
    cleanedLines.push(trimmed)
  }

  const cleanedContent = cleanedLines.join('\n').trim()
  return {
    content: cleanedContent.length > 0 ? cleanedContent : content.trim(),
    deadlineDate,
  }
}

export const sendTask = async (
  { task, project, label, priority, due, uuid, includePageLink }: FormInput,
  options?: { pageName?: string },
) => {
  if (logseq.settings!.apiToken === '') {
    logseq.UI.showMsg('Invalid API token', 'error')
    return
  }

  const api = new TodoistApi(logseq.settings!.apiToken as string)

  const currGraph = await logseq.App.getCurrentGraph()
  const currGraphName = currGraph?.name

  const descriptionParts: string[] = []
  if (logseq.settings!.sendAppendUri) {
    descriptionParts.push(`[Link to Logseq](logseq://graph/${currGraphName}?block-id=${uuid})`)
  }

  if (includePageLink && options?.pageName) {
    descriptionParts.push(`Page: [[${options.pageName}]]`)
  }

  const cleanedTask = removeTaskFlags(task)
  const { content: taskWithoutDeadline, deadlineDate } = extractDeadline(cleanedTask)

  const sendObj: Parameters<TodoistApi['addTask']>[0] = {
    content: taskWithoutDeadline,
    description: descriptionParts.join('\n'),
  }

  if (project !== '--- ---') {
    sendObj.projectId = getIdFromString(project)
  }

  if (label.length > 0 && label[0] !== '--- ---') {
    sendObj.labels = label.map((l) => getNameFromString(l))
  }

  if (priority) {
    sendObj.priority = parseInt(priority)
  }

  if (deadlineDate) {
    sendObj.deadlineDate = deadlineDate
  } else if (due !== '') {
    sendObj.dueString = due
  }

  try {
    const res = await api.addTask(sendObj)
    logseq.UI.showMsg('Task sent successfully', 'success', { timeout: 3000 })
    return res
  } catch (error) {
    console.error(error)
    await logseq.UI.showMsg(`Task was not sent: ${(error as Error).message}`)
  }
}
