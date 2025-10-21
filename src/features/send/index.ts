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

  const sendObj = {
    content: removeTaskFlags(task),
    description: descriptionParts.join('\n'),
    ...(project !== '--- ---' && { projectId: getIdFromString(project) }),
    ...(label.length > 0 && label[0] !== '--- ---' && {
      labels: label.map((l) => getNameFromString(l)),
    }),
    ...(priority && { priority: parseInt(priority) }),
    ...(due !== '' && { dueString: due }),
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
