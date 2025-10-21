import { describe, expect, it } from 'vitest'

import { extractSchedulingMarkers } from '../src/features/send'

describe('extractSchedulingMarkers', () => {
  it('removes DEADLINE lines and extracts the ISO date', () => {
    const input = 'TODO Write report\nDEADLINE: <2025-10-23 Thu>'
    const result = extractSchedulingMarkers(input)

    expect(result.deadlineDate).toBe('2025-10-23')
    expect(result.scheduledDate).toBeNull()
    expect(result.content).toBe('TODO Write report')
  })

  it('returns null deadline when no marker is present', () => {
    const input = 'TODO Call Alice'
    const result = extractSchedulingMarkers(input)

    expect(result.deadlineDate).toBeNull()
    expect(result.scheduledDate).toBeNull()
    expect(result.content).toBe(input)
  })

  it('extracts scheduled and deadline markers when both exist', () => {
    const input = 'TODO Prepare slides\nSCHEDULED: <2025-11-01 Sat>\nDEADLINE: <2025-11-03 Mon>'
    const result = extractSchedulingMarkers(input)

    expect(result.scheduledDate).toBe('2025-11-01')
    expect(result.deadlineDate).toBe('2025-11-03')
    expect(result.content).toBe('TODO Prepare slides')
  })
})
