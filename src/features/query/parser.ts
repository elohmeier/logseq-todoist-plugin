import YAML from 'yaml'
import { z } from 'zod'

import {
  GroupingOption,
  MetadataOption,
  QueryConfig,
  QueryParseError,
  QueryParseResult,
  QueryParseSuccess,
  QueryParseWarning,
  SortingOption,
} from './types'

const DEFAULT_SHOW: MetadataOption[] = [
  MetadataOption.Due,
  MetadataOption.Description,
  MetadataOption.Labels,
  MetadataOption.Project,
]

const DEFAULT_SORTING: SortingOption[] = [SortingOption.TodoistOrder]
const DEFAULT_AUTOFRESH = 0
const DEFAULT_NAME = ''

const VALID_KEYS = ['name', 'filter', 'autorefresh', 'groupBy', 'sorting', 'show']
const KEY_ALIASES: Record<string, string> = {
  group_by: 'groupBy',
  auto_refresh: 'autorefresh',
}

const groupingSchema = z
  .enum([
    GroupingOption.Hierarchy,
    GroupingOption.Project,
    GroupingOption.Section,
    GroupingOption.DueDate,
    GroupingOption.Labels,
    GroupingOption.Priority,
  ])
  .default(GroupingOption.Hierarchy)

const sortingSchema = z
  .enum([
    SortingOption.TodoistOrder,
    SortingOption.DateAscending,
    SortingOption.DateDescending,
    SortingOption.PriorityAscending,
    SortingOption.PriorityDescending,
    SortingOption.AddedAscending,
    SortingOption.AddedDescending,
  ])
  .array()
  .default(DEFAULT_SORTING)

const metadataSchema = z
  .union([
    z
      .enum([
        MetadataOption.Due,
        MetadataOption.Description,
        MetadataOption.Labels,
        MetadataOption.Project,
        MetadataOption.Url,
      ])
      .array(),
    z
      .literal('none')
      .transform<MetadataOption[]>(() => []),
  ])
  .default(DEFAULT_SHOW)

const querySchema = z.object({
  name: z.string().optional().default(DEFAULT_NAME),
  filter: z.string().min(1, { message: 'filter must be a non-empty string' }),
  autorefresh: z
    .number({ coerce: true })
    .int({ message: 'autorefresh must be an integer' })
    .nonnegative({ message: 'autorefresh must be greater or equal to 0' })
    .optional()
    .default(DEFAULT_AUTOFRESH),
  groupBy: groupingSchema.optional().default(GroupingOption.Hierarchy),
  sorting: sortingSchema,
  show: metadataSchema,
})

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Query definition must be an object')
  }
  return value as Record<string, unknown>
}

const normalizeKeys = (input: Record<string, unknown>) => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const alias = KEY_ALIASES[key]
    result[alias ?? key] = value
  }
  return result
}

const gatherWarnings = (input: Record<string, unknown>): QueryParseWarning[] => {
  const warnings: QueryParseWarning[] = []
  for (const key of Object.keys(input)) {
    if (!VALID_KEYS.includes(key)) {
      warnings.push(`Unknown option '${key}' was ignored.`)
    }
  }
  return warnings
}

const toQueryConfig = (data: z.infer<typeof querySchema>): QueryConfig => {
  return {
    name: data.name ?? DEFAULT_NAME,
    filter: data.filter,
    autorefresh: data.autorefresh ?? DEFAULT_AUTOFRESH,
    groupBy: data.groupBy ?? GroupingOption.Hierarchy,
    sorting: dedupeSorting(data.sorting ?? DEFAULT_SORTING),
    show: new Set(data.show ?? DEFAULT_SHOW),
  }
}

const dedupeSorting = (sorting: SortingOption[]): SortingOption[] => {
  const seen = new Set<SortingOption>()
  const result: SortingOption[] = []
  for (const option of sorting) {
    if (!seen.has(option)) {
      seen.add(option)
      result.push(option)
    }
  }
  return result.length > 0 ? result : DEFAULT_SORTING
}

const makeFilterOnly = (filter: string, warnings: QueryParseWarning[] = []): QueryParseSuccess => {
  const config: QueryConfig = {
    name: DEFAULT_NAME,
    filter: filter.trim(),
    autorefresh: DEFAULT_AUTOFRESH,
    groupBy: GroupingOption.Hierarchy,
    sorting: DEFAULT_SORTING,
    show: new Set(DEFAULT_SHOW),
  }
  return {
    ok: true,
    config,
    warnings,
  }
}

const formatZodErrors = (error: z.ZodError): [string, string[]] => {
  const headline = 'Invalid query configuration'
  const details = error.errors.map((issue) => {
    const path = issue.path.length > 0 ? ` (${issue.path.join('.')})` : ''
    return `${issue.message}${path}`
  })
  return [headline, details]
}

const extractQuerySource = (raw: string): string => {
  const trimmed = raw.trim()
  if (trimmed.startsWith('```')) {
    const fenceMatch = trimmed.match(/```(?:todoist)?([\s\S]*?)```/i)
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim()
    }
  }
  return trimmed
}

export const parseQuery = (raw: string): QueryParseResult => {
  const source = extractQuerySource(raw)
  if (source.length === 0) {
    return {
      ok: false,
      error: 'Query is empty',
    }
  }

  let parsed: unknown
  try {
    parsed = YAML.parse(source)
  } catch {
    return makeFilterOnly(source, ["Unable to parse query as YAML or JSON. Treating content as Todoist filter."])
  }

  if (parsed === null || parsed === undefined) {
    return {
      ok: false,
      error: 'Query definition is empty',
    }
  }

  if (typeof parsed === 'string') {
    if (parsed.trim().length === 0) {
      return {
        ok: false,
        error: 'Query filter must be a non-empty string',
      }
    }
    return makeFilterOnly(parsed)
  }

  try {
    const normalized = normalizeKeys(ensureObject(parsed))
    const warnings = gatherWarnings(normalized)
    const result = querySchema.safeParse(normalized)
    if (!result.success) {
      const [error, details] = formatZodErrors(result.error)
      const failure: QueryParseError = {
        ok: false,
        error,
        details,
      }
      return failure
    }

    const config = toQueryConfig(result.data)
    return {
      ok: true,
      config,
      warnings,
    }
  } catch (error) {
    const failure: QueryParseError = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected error while parsing query',
    }
    return failure
  }
}
