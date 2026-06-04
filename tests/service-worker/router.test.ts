import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockHandleGetSession = vi.fn().mockResolvedValue({ data: { userId: 'u1', username: 'test', email: 'a@b.com', accessToken: 'tok', refreshToken: 'ref' }, error: null })

vi.mock('../../src/service-worker/auth', () => ({
  handleSendMagicLink: vi.fn(),
  handleAuthCallback: vi.fn(),
  handleGetSession: mockHandleGetSession,
  handleSignOut: vi.fn(),
  handleSetUsername: vi.fn(),
}))

vi.mock('../../src/service-worker/api', () => ({
  handleGetReviews: vi.fn(),
  handleAddReview: vi.fn(),
  handleVote: vi.fn(),
  handleGetTrending: vi.fn(),
}))

vi.mock('../../src/service-worker/supabase', () => ({
  supabase: { auth: { startAutoRefresh: vi.fn() } },
}))

describe('service worker message router', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns error for unknown action', async () => {
    const { handleMessage } = await import('../../src/service-worker/index')
    const result = await handleMessage({ action: 'unknownAction' } as any)
    expect(result.error).toMatch(/unknown action/i)
  })

  it('routes getSession action to handleGetSession', async () => {
    const { handleMessage } = await import('../../src/service-worker/index')
    await handleMessage({ action: 'getSession' })
    expect(mockHandleGetSession).toHaveBeenCalledTimes(1)
  })
})
