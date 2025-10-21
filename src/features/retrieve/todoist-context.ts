import type {
  Label,
  PersonalProject,
  Section,
  TodoistApi,
  WorkspaceProject,
} from '@doist/todoist-api-typescript'

import { collectPaginatedResults } from '../helpers'

export type ProjectInfo = Pick<PersonalProject | WorkspaceProject, 'id' | 'name' | 'childOrder'>

export type SectionInfo = Pick<Section, 'id' | 'name' | 'sectionOrder' | 'projectId'>

export type LabelInfo = Pick<Label, 'id' | 'name'>

export interface TodoistContext {
  projects: Map<string, ProjectInfo>
  sections: Map<string, SectionInfo>
  labels: Map<string, LabelInfo>
}

export interface ContextRequirements {
  projects: boolean
  sections: boolean
  labels: boolean
}

const emptyContext = (): TodoistContext => ({
  projects: new Map(),
  sections: new Map(),
  labels: new Map(),
})

export const fetchTodoistContext = async (
  api: TodoistApi,
  requirements: ContextRequirements,
): Promise<TodoistContext> => {
  const context = emptyContext()

  if (requirements.projects || requirements.sections) {
    const projects = await collectPaginatedResults<PersonalProject | WorkspaceProject>((cursor) =>
      api.getProjects(cursor ? { cursor } : undefined),
    )
    projects.forEach((project) => {
      context.projects.set(project.id, {
        id: project.id,
        name: project.name,
        childOrder: project.childOrder,
      })
    })
  }

  if (requirements.sections) {
    const sections = await collectPaginatedResults<Section>((cursor) =>
      api.getSections({ projectId: null, cursor: cursor ?? null }),
    )
    sections.forEach((section) => {
      context.sections.set(section.id, {
        id: section.id,
        name: section.name,
        sectionOrder: section.sectionOrder,
        projectId: section.projectId,
      })
    })
  }

  if (requirements.labels) {
    const labels = await collectPaginatedResults<Label>((cursor) =>
      api.getLabels(cursor ? { cursor } : undefined),
    )
    labels.forEach((label) => {
      context.labels.set(label.id, {
        id: label.id,
        name: label.name,
      })
    })
  }

  return context
}
