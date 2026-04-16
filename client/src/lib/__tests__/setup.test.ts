import { describe, it, expect } from 'vitest'

describe('setup', () => {
  it('sanity check', () => {
    expect(1 + 1).toBe(2)
  })

  it('cn utility resolves', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('foo', 'bar')).toBe('foo bar')
  })
})