import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockGetSession = vi.fn()

vi.mock('../../src/service-worker/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    auth: { getSession: mockGetSession },
  },
}))

describe('handleGetReviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls get_reviews_for_recipe rpc with correct params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    await handleGetReviews('r268795', 'cookidoo.co.uk')
    expect(mockRpc).toHaveBeenCalledWith('get_reviews_for_recipe', {
      p_cookidoo_id: 'r268795',
      p_domain: 'cookidoo.co.uk',
    })
  })

  it('filters out hidden reviews (net_score < -3 AND dislike_ratio > 0.5)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: '1', likes: 0, dislikes: 5, stars: 3, type: 'comment', body: 'bad', username: 'a', email: 'a@b.com', created_at: '', recipe_id: '', user_id: '', user_vote: null },
        { id: '2', likes: 10, dislikes: 1, stars: 5, type: 'comment', body: 'good', username: 'b', email: 'b@c.com', created_at: '', recipe_id: '', user_id: '', user_vote: null },
      ],
      error: null,
    })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    const result = await handleGetReviews('r123', 'cookidoo.es')
    expect(result.data).toHaveLength(1)
    expect(result.data![0]!.id).toBe('2')
  })
})

describe('handleGetTrending', () => {
  it('calls get_trending_recipes rpc', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { handleGetTrending } = await import('../../src/service-worker/api')
    await handleGetTrending()
    expect(mockRpc).toHaveBeenCalledWith('get_trending_recipes', { p_limit: 10 })
  })
})

describe('handleVote', () => {
  it('upserts vote row', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: mockUpsert })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })
    const { handleVote } = await import('../../src/service-worker/api')
    await handleVote('review-uuid', 1)
    expect(mockFrom).toHaveBeenCalledWith('votes')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ review_id: 'review-uuid', value: 1 }),
      expect.objectContaining({ onConflict: 'review_id,user_id' })
    )
  })
})
