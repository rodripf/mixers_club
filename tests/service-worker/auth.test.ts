import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockSignInWithOtp = vi.fn()
const mockSetSession = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()
const mockFrom = vi.fn()

vi.mock('../../src/service-worker/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      setSession: mockSetSession,
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
    from: mockFrom,
  },
}))

describe('handleSendMagicLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls supabase signInWithOtp with the email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    const { handleSendMagicLink } = await import('../../src/service-worker/auth')
    const result = await handleSendMagicLink('test@example.com')
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: expect.objectContaining({ shouldCreateUser: true }),
    })
    expect(result.error).toBeNull()
  })

  it('returns error when supabase fails', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'rate limited' } })
    const { handleSendMagicLink } = await import('../../src/service-worker/auth')
    const result = await handleSendMagicLink('test@example.com')
    expect(result.error).toBe('rate limited')
  })
})

describe('handleGetSession', () => {
  it('returns null when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    const { handleGetSession } = await import('../../src/service-worker/auth')
    const result = await handleGetSession()
    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
  })

  it('returns session data when authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'uid-1', email: 'a@b.com' },
          access_token: 'tok',
          refresh_token: 'ref',
        },
      },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { username: 'chef99' }, error: null }),
    })
    const { handleGetSession } = await import('../../src/service-worker/auth')
    const result = await handleGetSession()
    expect(result.data?.userId).toBe('uid-1')
    expect(result.data?.username).toBe('chef99')
  })
})
