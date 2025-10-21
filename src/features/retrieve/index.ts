import { Task, TodoistApi } from '@doist/todoist-api-typescript'
import { getDateForPage } from 'logseq-dateutils'

import { collectPaginatedResults, getIdFromString } from '../helpers'
import {
  GroupingOption,
  MetadataOption,
  QueryConfig,
  SortingOption,
} from '../query'
import { formatDueDate, formatDueIso, formatLogseqDate, resolveDueDate } from './due-date'
import { type RenderPreferences,resolveRenderPreferences } from './render-options'
import { createTaskBlock, type TaskBlock } from './task-block'
import {
  type ContextRequirements,
  fetchTodoistContext,
  type LabelInfo,
  type ProjectInfo,
  type SectionInfo,
  type TodoistContext,
} from './todoist-context'

type RetrieveMode = 'default' | 'today' | 'custom'

interface TaskAnnotations {
  comments: string | null
  attachments: string | null
}

interface DisplayTask {
  source: Task
  annotations: TaskAnnotations
  project: ProjectInfo | undefined
  section: SectionInfo | undefined
  labelNames: string[]
  dueInline: string | null
  dueIso: string | null
  dueHeading: string | null
  dueFlag: ReturnType<typeof formatDueDate>['flag']
  dueHasTime: boolean
  dueDate: Date | null
  creationDate: string | null
}

export interface RetrieveResult {
  tasks: Task[]
  blocks: TaskBlock[]
  title?: string
}

const ensureApi = () => {
  if (!logseq.settings || logseq.settings.apiToken === '') {
    throw new Error('Invalid API token')
  }

  return new TodoistApi(logseq.settings.apiToken as string)
}

const makeContextRequirements = (
  config: QueryConfig | undefined,
  preferences: RenderPreferences,
): ContextRequirements => {
  const show = config?.show ?? preferences.showMetadata
  const requiresProjects =
    (config?.groupBy === GroupingOption.Project ||
      config?.groupBy === GroupingOption.Section ||
      show.has(MetadataOption.Project)) === true

  const requiresSections = config?.groupBy === GroupingOption.Section

  const requiresLabels =
    config?.groupBy === GroupingOption.Labels ||
    (preferences.embedLabelsInline && show.has(MetadataOption.Labels)) ||
    show.has(MetadataOption.Labels)

  return {
    projects: requiresProjects || requiresSections,
    sections: requiresSections,
    labels: requiresLabels,
  }
}

const fetchTasksByProject = async (api: TodoistApi, projectId: string): Promise<Task[]> => {
  return collectPaginatedResults<Task>((cursor) =>
    api.getTasks({ projectId, cursor: cursor ?? undefined }),
  )
}

const fetchTasksByFilter = async (api: TodoistApi, filter: string): Promise<Task[]> => {
  return collectPaginatedResults<Task>((cursor) =>
    api.getTasksByFilter({ query: filter, cursor: cursor ?? null }),
  )
}

const loadComments = async (api: TodoistApi, taskId: string): Promise<TaskAnnotations> => {
  const comments = await collectPaginatedResults((cursor) =>
    api.getComments({ taskId, cursor: cursor ?? null }),
  )

  if (comments.length === 0) {
    return {
      comments: null,
      attachments: null,
    }
  }

  const textParts = comments
    .filter((comment) => !comment.fileAttachment)
    .map((comment) => comment.content)
  const attachmentParts = comments
    .map((comment) => comment.fileAttachment)
    .filter(
      (attachment): attachment is NonNullable<(typeof comments)[number]['fileAttachment']> =>
        Boolean(attachment?.fileUrl),
    )
    .map((attachment) => `[${attachment.fileName ?? 'attachment'}](${attachment.fileUrl})`)

  return {
    comments: textParts.length > 0 ? textParts.join(', ') : null,
    attachments: attachmentParts.length > 0 ? attachmentParts.join(', ') : null,
  }
}

const resolveLabelNames = (labels: string[], lookup: Map<string, LabelInfo>) => {
  if (labels.length === 0) {
    return []
  }

  return labels.map((label) => lookup.get(label)?.name ?? label)
}

const buildDisplayTasks = async (
  api: TodoistApi,
  tasks: Task[],
  context: TodoistContext,
  preferences: RenderPreferences,
) => {
  const userConfig = await logseq.App.getUserConfigs()
  const preferredDateFormat = userConfig.preferredDateFormat

  const annotations = await Promise.all(tasks.map((task) => loadComments(api, task.id)))

  return tasks.map((task, index): DisplayTask => {
    const annotation = annotations[index]!
    const dueSource = task.deadline
      ? ({ date: task.deadline.date, datetime: null } as {
          date?: string | null
          datetime?: string | null
        })
      : task.due
    const dueDate = resolveDueDate(dueSource)
    const dueHasTime = Boolean(dueSource?.datetime)
    const duePresentation = formatDueDate(dueSource)
    const labelNames = resolveLabelNames(task.labels, context.labels)
    const creationDate =
      preferences.appendCreationDateProperty && task.addedAt
        ? getDateForPage(new Date(task.addedAt), preferredDateFormat)
        : null

    return {
      source: task,
      annotations: annotation,
      project: context.projects.get(task.projectId),
      section: task.sectionId ? context.sections.get(task.sectionId) : undefined,
      labelNames,
      dueInline: duePresentation.inline,
      dueIso: formatDueIso(dueSource),
      dueHeading: duePresentation.heading,
      dueFlag: duePresentation.flag,
      dueHasTime,
      dueDate,
      creationDate,
    }
  })
}

const makeTaskContent = (displayTask: DisplayTask, preferences: RenderPreferences, config?: QueryConfig) => {
  let content = displayTask.source.content

  if (preferences.prependTodoKeyword) {
    content = content.startsWith('TODO ') ? content : `TODO ${content}`
  }

  if (preferences.embedLabelsInline && displayTask.labelNames.length > 0) {
    const labelsInline = displayTask.labelNames.map((label) => `[[${label}]]`).join(' ')
    content = `${content} ${labelsInline}`.trim()
  }

  const inlineMetadata: string[] = []

  const showSet = config?.show ?? preferences.showMetadata
  const showDue = showSet.has(MetadataOption.Due)
  const showProject = showSet.has(MetadataOption.Project)

  if (showDue && displayTask.dueInline) {
    inlineMetadata.push(displayTask.dueInline)
  }

  if (showProject && displayTask.project) {
    inlineMetadata.push(displayTask.project.name)
  }

  if (inlineMetadata.length > 0) {
    content = `${content} — ${inlineMetadata.join(' | ')}`
  }

  if (showDue && displayTask.dueDate) {
    content = `${content}\nSCHEDULED: ${formatLogseqDate(displayTask.dueDate, displayTask.dueHasTime)}`
  }

  if (showDue && displayTask.source.deadline?.date) {
    const deadline = resolveDueDate({ date: displayTask.source.deadline.date })
    if (deadline) {
      content = `${content}\nDEADLINE: ${formatLogseqDate(deadline, false)}`
    }
  }

  return content
}

const buildProperties = (displayTask: DisplayTask, preferences: RenderPreferences, config?: QueryConfig) => {
  const properties: Record<string, string> = {}
  const showSet = config?.show ?? preferences.showMetadata

  if (preferences.appendTodoistIdProperty) {
    properties.todoistid = displayTask.source.id
  }

  if (displayTask.annotations.comments) {
    properties.comments = displayTask.annotations.comments
  }

  if (displayTask.annotations.attachments) {
    properties.attachments = displayTask.annotations.attachments
  }

  if (preferences.appendCreationDateProperty && displayTask.creationDate) {
    properties.created = displayTask.creationDate
  }

  if (displayTask.source.deadline?.date) {
    properties.todoist_deadline = displayTask.source.deadline.date
  }

  if (showSet.has(MetadataOption.Due) && displayTask.dueIso) {
    properties.todoist_due = displayTask.dueIso
  }

  if (showSet.has(MetadataOption.Description) && displayTask.source.description) {
    properties.todoist_description = displayTask.source.description
  }

  if (showSet.has(MetadataOption.Project) && displayTask.project) {
    properties.todoist_project = displayTask.project.name
  }

  if (displayTask.section && config?.groupBy === GroupingOption.Section) {
    properties.todoist_section = displayTask.section.name
  }

  if (showSet.has(MetadataOption.Labels) && displayTask.labelNames.length > 0) {
    properties.todoist_labels = displayTask.labelNames.join(', ')
  }

  if (showSet.has(MetadataOption.Url) && displayTask.source.url) {
    properties.todoist_url = displayTask.source.url
  }

  return properties
}

const sortByOptions = (tasks: DisplayTask[], sorting: SortingOption[]): DisplayTask[] => {
  const clone = [...tasks]

  const applySorting = (opt: SortingOption) => {
    switch (opt) {
      case SortingOption.DateAscending:
        clone.sort((a, b) => {
          const aDue = a.dueDate
          const bDue = b.dueDate
          if (!aDue && !bDue) return 0
          if (!aDue) return 1
          if (!bDue) return -1
          return aDue.getTime() - bDue.getTime()
        })
        break
      case SortingOption.DateDescending:
        clone.sort((a, b) => {
          const aDue = a.dueDate
          const bDue = b.dueDate
          if (!aDue && !bDue) return 0
          if (!aDue) return 1
          if (!bDue) return -1
          return bDue.getTime() - aDue.getTime()
        })
        break
      case SortingOption.PriorityAscending:
        clone.sort((a, b) => a.source.priority - b.source.priority)
        break
      case SortingOption.PriorityDescending:
        clone.sort((a, b) => b.source.priority - a.source.priority)
        break
      case SortingOption.AddedAscending:
        clone.sort((a, b) => {
          const aDate = a.source.addedAt ? new Date(a.source.addedAt).getTime() : Infinity
          const bDate = b.source.addedAt ? new Date(b.source.addedAt).getTime() : Infinity
          return aDate - bDate
        })
        break
      case SortingOption.AddedDescending:
        clone.sort((a, b) => {
          const aDate = a.source.addedAt ? new Date(a.source.addedAt).getTime() : 0
          const bDate = b.source.addedAt ? new Date(b.source.addedAt).getTime() : 0
          return bDate - aDate
        })
        break
      case SortingOption.TodoistOrder:
      default:
        clone.sort((a, b) => a.source.childOrder - b.source.childOrder)
        break
    }
  }

  sorting.forEach(applySorting)
  return clone
}

const buildHierarchyBlocks = (
  tasks: DisplayTask[],
  preferences: RenderPreferences,
  config?: QueryConfig,
) => {
  const blockMap = new Map<string, TaskBlock>()
  const queue: TaskBlock[] = []

  tasks.forEach((displayTask) => {
    const content = makeTaskContent(displayTask, preferences, config)
    const properties = buildProperties(displayTask, preferences, config)
    const block = createTaskBlock(content, Object.keys(properties).length ? properties : undefined)
    blockMap.set(displayTask.source.id, block)
  })

  tasks.forEach((displayTask) => {
    const block = blockMap.get(displayTask.source.id)
    if (!block) return

    const parentId = displayTask.source.parentId
    if (parentId && blockMap.has(parentId)) {
      const parentBlock = blockMap.get(parentId)!
      parentBlock.children.push(block)
    } else {
      queue.push(block)
    }
  })

  return queue
}

interface GroupResult {
  heading: string
  tasks: DisplayTask[]
  order: number
}

const groupTasks = (tasks: DisplayTask[], config: QueryConfig | undefined): GroupResult[] => {
  if (!config || config.groupBy === GroupingOption.Hierarchy) {
    return []
  }

  switch (config.groupBy) {
    case GroupingOption.Project:
      return groupByProject(tasks)
    case GroupingOption.Section:
      return groupBySection(tasks)
    case GroupingOption.DueDate:
      return groupByDue(tasks)
    case GroupingOption.Priority:
      return groupByPriority(tasks)
    case GroupingOption.Labels:
      return groupByLabel(tasks)
    default:
      return []
  }
}

const groupByProject = (tasks: DisplayTask[]): GroupResult[] => {
  const groups = new Map<string, GroupResult>()
  tasks.forEach((task) => {
    const project = task.project?.name ?? 'No Project'
    if (!groups.has(project)) {
      groups.set(project, {
        heading: project,
        order: task.project?.childOrder ?? Number.MAX_SAFE_INTEGER,
        tasks: [],
      })
    }
    groups.get(project)!.tasks.push(task)
  })

  return Array.from(groups.values()).sort((a, b) => a.order - b.order)
}

const groupBySection = (tasks: DisplayTask[]): GroupResult[] => {
  const groups = new Map<string, GroupResult>()
  tasks.forEach((task) => {
    const projectName = task.project?.name ?? 'No Project'
    const sectionName = task.section?.name ?? 'No Section'
    const key = `${projectName} / ${sectionName}`
    if (!groups.has(key)) {
      groups.set(key, {
        heading: key,
        order: task.section?.sectionOrder ?? Number.MAX_SAFE_INTEGER,
        tasks: [],
      })
    }
    groups.get(key)!.tasks.push(task)
  })

  return Array.from(groups.values()).sort((a, b) => a.order - b.order)
}

const groupByDue = (tasks: DisplayTask[]): GroupResult[] => {
  const groups = new Map<string, GroupResult>()
  tasks.forEach((task) => {
    let heading = 'No Due Date'
    let order = 5

    switch (task.dueFlag) {
      case 'overdue':
        heading = 'Overdue'
        order = 0
        break
      case 'today':
        heading = 'Today'
        order = 1
        break
      case 'tomorrow':
        heading = 'Tomorrow'
        order = 2
        break
      case 'upcoming':
        heading = task.dueHeading ?? 'Upcoming'
        order = 3
        break
      case 'none':
      default:
        heading = 'No Due Date'
        order = 4
        break
    }

    if (!groups.has(heading)) {
      groups.set(heading, {
        heading,
        order,
        tasks: [],
      })
    }
    groups.get(heading)!.tasks.push(task)
  })

  return Array.from(groups.values()).sort((a, b) => a.order - b.order)
}

const groupByPriority = (tasks: DisplayTask[]): GroupResult[] => {
  const priorityLabels: Record<number, string> = {
    1: 'Priority 1',
    2: 'Priority 2',
    3: 'Priority 3',
    4: 'Priority 4',
  }

  const groups = new Map<number, GroupResult>()
  tasks.forEach((task) => {
    const heading = priorityLabels[task.source.priority] ?? `Priority ${task.source.priority}`
    if (!groups.has(task.source.priority)) {
      groups.set(task.source.priority, {
        heading,
        order: -task.source.priority,
        tasks: [],
      })
    }
    groups.get(task.source.priority)!.tasks.push(task)
  })

  return Array.from(groups.values()).sort((a, b) => b.order - a.order)
}

const groupByLabel = (tasks: DisplayTask[]): GroupResult[] => {
  const groups = new Map<string, GroupResult>()

  tasks.forEach((task) => {
    if (task.labelNames.length === 0) {
      if (!groups.has('No Labels')) {
        groups.set('No Labels', {
          heading: 'No Labels',
          order: Number.MAX_SAFE_INTEGER,
          tasks: [],
        })
      }
      groups.get('No Labels')!.tasks.push(task)
      return
    }

    const primaryLabel = [...task.labelNames].sort()[0]!
    if (!groups.has(primaryLabel)) {
      groups.set(primaryLabel, {
        heading: primaryLabel,
        order: 0,
        tasks: [],
      })
    }
    groups.get(primaryLabel)!.tasks.push(task)
  })

  return Array.from(groups.values()).sort((a, b) => a.heading.localeCompare(b.heading))
}

const buildBlocksFromDisplayTasks = (
  displayTasks: DisplayTask[],
  preferences: RenderPreferences,
  config?: QueryConfig,
) => {
  if (!config || config.groupBy === GroupingOption.Hierarchy) {
    const sorted = sortByOptions(displayTasks, config?.sorting ?? [SortingOption.TodoistOrder])
    return buildHierarchyBlocks(sorted, preferences, config)
  }

  const grouped = groupTasks(displayTasks, config)
  const blocks: TaskBlock[] = []

  grouped.forEach((group) => {
    const sorted = sortByOptions(group.tasks, config?.sorting ?? [SortingOption.TodoistOrder])
    const children = sorted.map((task) => {
      const content = makeTaskContent(task, preferences, config)
      const properties = buildProperties(task, preferences, config)
      return createTaskBlock(content, Object.keys(properties).length ? properties : undefined)
    })
    blocks.push(createTaskBlock(group.heading, undefined, children))
  })

  return blocks
}

const deleteTasksFromTodoist = async (api: TodoistApi, tasks: Task[]) => {
  for (const task of tasks) {
    await api.deleteTask(task.id)
  }
}

const buildBlocks = async (
  api: TodoistApi,
  tasks: Task[],
  config?: QueryConfig,
): Promise<TaskBlock[]> => {
  if (tasks.length === 0) {
    return []
  }

  const preferences = resolveRenderPreferences(config)
  const requirements = makeContextRequirements(config, preferences)
  const context = await fetchTodoistContext(api, requirements)
  const displayTasks = await buildDisplayTasks(api, tasks, context, preferences)
  return buildBlocksFromDisplayTasks(displayTasks, preferences, config)
}

export const retrieveTasks = async (
  mode: RetrieveMode,
  customFilter?: string,
): Promise<RetrieveResult> => {
  try {
    const api = ensureApi()
    const results: Task[] = []

    switch (mode) {
      case 'default': {
        if (logseq.settings?.retrieveDefaultProject === '--- ---') {
          await logseq.UI.showMsg('Please select a default project', 'error')
          return { tasks: [], blocks: [] }
        }
        const projectId = getIdFromString(logseq.settings!.retrieveDefaultProject as string)
        results.push(...(await fetchTasksByProject(api, projectId)))
        break
      }
      case 'today': {
        results.push(...(await fetchTasksByFilter(api, 'today')))
        break
      }
      case 'custom': {
        if (!customFilter) {
          await logseq.UI.showMsg('Missing custom filter', 'error')
          return { tasks: [], blocks: [] }
        }
        results.push(...(await fetchTasksByFilter(api, customFilter)))
        break
      }
      default:
        break
    }

    if (results.length === 0) {
      return { tasks: [], blocks: [] }
    }

    if (logseq.settings?.retrieveClearTasks) {
      await deleteTasksFromTodoist(api, results)
    }

    const blocks = await buildBlocks(api, results)
    return {
      tasks: results,
      blocks,
    }
  } catch (error) {
    console.error(error)
    await logseq.UI.showMsg(`Error: ${(error as Error).message}`, 'error')
    return {
      tasks: [],
      blocks: [],
    }
  }
}

export const runQuery = async (config: QueryConfig): Promise<RetrieveResult> => {
  try {
    const api = ensureApi()
    const tasks = await fetchTasksByFilter(api, config.filter)

    if (tasks.length === 0) {
      return { tasks: [], blocks: [], title: config.name }
    }

    const blocks = await buildBlocks(api, tasks, config)

    if (logseq.settings?.retrieveClearTasks) {
      await deleteTasksFromTodoist(api, tasks)
    }

    return {
      tasks,
      blocks,
      title: config.name,
    }
  } catch (error) {
    console.error(error)
    await logseq.UI.showMsg(`Error: ${(error as Error).message}`, 'error')
    return {
      tasks: [],
      blocks: [],
      title: config.name,
    }
  }
}
