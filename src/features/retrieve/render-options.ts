import { MetadataOption, QueryConfig } from '../query'

const getSettings = () => (logseq.settings as Record<string, unknown> | undefined) ?? {}

const isSettingEnabled = (key: string): boolean => Boolean(getSettings()[key])

const DEFAULT_SHOW_FROM_SETTINGS = () => {
  const show = new Set<MetadataOption>()
  if (isSettingEnabled('retrieveAppendTodo')) {
    // handled separately as inline marker
  }
  if (isSettingEnabled('retrieveAppendLabels')) {
    show.add(MetadataOption.Labels)
  }
  if (isSettingEnabled('retrieveAppendTodoistId') || isSettingEnabled('appendTodoistId')) {
    // handled in properties, tracked separately
  }
  if (isSettingEnabled('retrieveAppendCreationDateTime')) {
    // properties only
  }
  if (isSettingEnabled('retrieveAppendUrl')) {
    show.add(MetadataOption.Url)
  }
  // Always show due date by default
  show.add(MetadataOption.Due)
  return show
}

export interface RenderPreferences {
  prependTodoKeyword: boolean
  embedLabelsInline: boolean
  appendCreationDateProperty: boolean
  appendTodoistIdProperty: boolean
  showMetadata: Set<MetadataOption>
}

export const resolveRenderPreferences = (config?: QueryConfig): RenderPreferences => {
  const settings = getSettings()
  const readBoolean = (key: string, fallback: boolean) => {
    if (settings[key] === undefined || settings[key] === null) {
      return fallback
    }
    return Boolean(settings[key])
  }

  const prependTodoKeyword = readBoolean('retrieveAppendTodo', true)
  const embedLabelsInline =
    config !== undefined
      ? config.show.has(MetadataOption.Labels)
      : isSettingEnabled('retrieveAppendLabels')
  const appendCreationDateProperty = readBoolean('retrieveAppendCreationDateTime', false)
  const appendTodoistIdProperty = (() => {
    const direct = settings['appendTodoistId']
    const legacy = settings['retrieveAppendTodoistId']
    if (direct === undefined && legacy === undefined) {
      return true
    }
    return Boolean(direct ?? legacy)
  })()

  const showMetadata =
    config?.show !== undefined ? config.show : DEFAULT_SHOW_FROM_SETTINGS()

  return {
    prependTodoKeyword,
    embedLabelsInline,
    appendCreationDateProperty,
    appendTodoistIdProperty,
    showMetadata,
  }
}
