export interface TaskBlock {
  content: string
  children: TaskBlock[]
  properties?: Record<string, string>
}

export const createTaskBlock = (
  content: string,
  properties?: Record<string, string>,
  children: TaskBlock[] = [],
): TaskBlock => ({
  content,
  children,
  ...(properties ? { properties } : {}),
})
