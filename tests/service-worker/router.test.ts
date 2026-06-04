import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('service worker message router', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns error for unknown action', async () => {
    const { handleMessage } = await import('../../src/service-worker/index')
    const result = await handleMessage({ action: 'unknownAction' } as any)
    expect(result.error).toMatch(/unknown action/i)
  })

  it('routes getSession action', async () => {
    vi.mock('../../src/service-worker/auth', () => ({
      handleGetSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    }))
    const { handleMessage } = await import('../../src/service-worker/index')
    const result = await handleMessage({ action: 'getSession' })
    expect(result).toEqual({ data: null, error: null })
  })
})
