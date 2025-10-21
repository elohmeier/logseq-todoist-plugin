import { describe, expect, it } from 'vitest'

import { extractDeadline } from '../src/features/send'

describe('extractDeadline', () => {
  it('removes DEADLINE lines and extracts the ISO date', () => {
    const input = 'TODO Write report\nDEADLINE: <2025-10-23 Thu>'
    const result = extractDeadline(input)

    expect(result.deadlineDate).toBe('2025-10-23')
    expect(result.content).toBe('TODO Write report')
  })

  it('returns null deadline when no marker is present', () => {
    const input = 'TODO Call Alice'
    const result = extractDeadline(input)

    expect(result.deadlineDate).toBeNull()
    expect(result.content).toBe(input)
  })
})
