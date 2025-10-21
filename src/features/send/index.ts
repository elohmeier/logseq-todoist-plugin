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

const SCHEDULED_REGEX = /^\s*SCHEDULED:\s*<(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/i
const DEADLINE_REGEX = /^\s*DEADLINE:\s*<(\d{4})-(\d{2})-(\d{2})/i

export const extractSchedulingMarkers = (content: string) => {
  let scheduledDate: string | null = null
  let deadlineDate: string | null = null
  const cleanedLines: string[] = []

  for (const line of content.split(/\n+/)) {
    const trimmed = line.trimEnd()
    const scheduledMatch = trimmed.match(SCHEDULED_REGEX)
    if (scheduledMatch) {
      const [, year, month, day] = scheduledMatch
      scheduledDate = `${year}-${month}-${day}`
      continue
    }

    const deadlineMatch = trimmed.match(DEADLINE_REGEX)
    if (deadlineMatch) {
      const [, year, month, day] = deadlineMatch
      deadlineDate = `${year}-${month}-${day}`
      continue
    }
    cleanedLines.push(trimmed)
  }

  const cleanedContent = cleanedLines.join('\n').trim()
  return {
    content: cleanedContent.length > 0 ? cleanedContent : content.trim(),
    scheduledDate,
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
  const {
    content: taskWithoutMarkers,
    scheduledDate,
    deadlineDate,
  } = extractSchedulingMarkers(cleanedTask)

  const sendObj: Parameters<TodoistApi['addTask']>[0] = {
    content: taskWithoutMarkers,
    description: descriptionParts.join('\n'),
    ...(project !== '--- ---' ? { projectId: getIdFromString(project) } : {}),
    ...(label.length > 0 && label[0] !== '--- ---'
      ? { labels: label.map((l) => getNameFromString(l)) }
      : {}),
    ...(priority ? { priority: parseInt(priority) } : {}),
    ...(scheduledDate
      ? { dueDate: scheduledDate }
      : due !== ''
        ? { dueString: due }
        : {}),
    ...(deadlineDate ? { deadlineDate } : {}),
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
