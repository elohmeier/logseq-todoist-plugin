type DueFlag = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none'

export interface DuePresentation {
  inline: string | null
  heading: string | null
  flag: DueFlag
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const toStartOfDay = (value: Date) => {
  const clone = new Date(value.getTime())
  clone.setHours(0, 0, 0, 0)
  return clone
}

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const differenceInDays = (target: Date, base: Date) => {
  const diff = toStartOfDay(target).getTime() - toStartOfDay(base).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

const describeFlag = (flag: DueFlag, dueDate: Date | null) => {
  if (!dueDate) {
    return null
  }

  switch (flag) {
    case 'today':
      return 'Today'
    case 'tomorrow':
      return 'Tomorrow'
    case 'overdue': {
      const diff = differenceInDays(dueDate, new Date())
      return relativeFormatter.format(diff, 'day')
    }
    default:
      return null
  }
}

export const resolveDueDate = (due: { date?: string | null; datetime?: string | null } | null) => {
  if (!due) {
    return null
  }

  return parseDate(due.datetime ?? due.date)
}

export const formatDueDate = (due: { date?: string | null; datetime?: string | null } | null): DuePresentation => {
  const dueDate = resolveDueDate(due)
  if (!dueDate) {
    return {
      inline: null,
      heading: null,
      flag: 'none',
    }
  }

  const diffDays = differenceInDays(dueDate, new Date())

  let flag: DueFlag = 'upcoming'
  if (diffDays < 0) {
    flag = 'overdue'
  } else if (diffDays === 0) {
    flag = 'today'
  } else if (diffDays === 1) {
    flag = 'tomorrow'
  }

  const datePart = dateFormatter.format(dueDate)
  const timePart = timeFormatter.format(dueDate)
  const descriptor = describeFlag(flag, dueDate)

  const inlineParts = [datePart]
  if (descriptor) {
    inlineParts.push(descriptor)
  }

  const includeTime = Boolean(due?.datetime)

  let inline: string | null
  if (inlineParts.length === 0) {
    inline = includeTime ? `@ ${timePart}` : null
  } else {
    inline = inlineParts.join(' • ')
    if (includeTime) {
      inline = `${inline} @ ${timePart}`
    }
  }
  const heading = descriptor ? `${datePart} · ${descriptor}` : datePart

  return {
    inline,
    heading,
    flag,
  }
}

export const formatDueIso = (due: { date?: string | null; datetime?: string | null } | null) => {
  const dueDate = resolveDueDate(due)
  if (!dueDate) {
    return null
  }
  return dueDate.toISOString()
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const formatLogseqDeadline = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const weekday = WEEKDAYS[date.getDay()]
  return `<${year}-${month}-${day} ${weekday}>`
}
