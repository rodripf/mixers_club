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

  it('fetches from DB and caches when no cached value exists', async () => {
    chrome.storage.local.get.mockResolvedValue({})
    mockRpc.mockResolvedValue({ data: [{ id: '1', likes: 0, dislikes: 0, stars: 5, type: 'comment', body: 'good', username: 'a', email_hash: 'abc', created_at: '', recipe_id: '', user_id: '', user_vote: null }], error: null })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    await handleGetReviews('r268795')
    expect(mockRpc).toHaveBeenCalledWith('get_reviews_for_recipe', { p_cookidoo_id: 'r268795' })
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'mc_reviews_r268795': expect.objectContaining({ data: expect.any(Array) }) })
    )
  })

  it('returns cached data without hitting DB when cache is fresh', async () => {
    const cached = { data: [{ id: '1', likes: 0, dislikes: 0 }], ts: Date.now() }
    chrome.storage.local.get.mockResolvedValue({ 'mc_reviews_r268795': cached })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    const result = await handleGetReviews('r268795')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(result.data).toEqual(cached.data)
  })

  it('refetches from DB when cache is older than 1 day', async () => {
    const stale = { data: [], ts: Date.now() - 25 * 60 * 60 * 1000 }
    chrome.storage.local.get.mockResolvedValue({ 'mc_reviews_r268795': stale })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    await handleGetReviews('r268795')
    expect(mockRpc).toHaveBeenCalled()
  })

  it('filters out hidden reviews (net_score < -3 AND dislike_ratio > 0.5)', async () => {
    chrome.storage.local.get.mockResolvedValue({})
    mockRpc.mockResolvedValue({
      data: [
        { id: '1', likes: 0, dislikes: 5, stars: 3, type: 'comment', body: 'bad', username: 'a', email_hash: 'aaa', created_at: '', recipe_id: '', user_id: '', user_vote: null },
        { id: '2', likes: 10, dislikes: 1, stars: 5, type: 'comment', body: 'good', username: 'b', email_hash: 'bbb', created_at: '', recipe_id: '', user_id: '', user_vote: null },
      ],
      error: null,
    })
    const { handleGetReviews } = await import('../../src/service-worker/api')
    const result = await handleGetReviews('r123')
    expect(result.data).toHaveLength(1)
    expect(result.data![0]!.id).toBe('2')
  })
})

describe('handleGetTrending', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches from DB and caches when no cached value exists', async () => {
    chrome.storage.local.get.mockResolvedValue({})
    mockRpc.mockResolvedValue({ data: [{ cookidoo_id: 'r1' }], error: null })
    const { handleGetTrending } = await import('../../src/service-worker/api')
    const result = await handleGetTrending()
    expect(mockRpc).toHaveBeenCalledWith('get_trending_recipes', { p_limit: 10 })
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ mc_trending_cache: expect.objectContaining({ data: [{ cookidoo_id: 'r1' }] }) })
    )
    expect(result.data).toEqual([{ cookidoo_id: 'r1' }])
  })

  it('returns cached data without hitting DB when cache is fresh', async () => {
    const cached = { data: [{ cookidoo_id: 'r2' }], ts: Date.now() }
    chrome.storage.local.get.mockResolvedValue({ mc_trending_cache: cached })
    const { handleGetTrending } = await import('../../src/service-worker/api')
    const result = await handleGetTrending()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(result.data).toEqual(cached.data)
  })

  it('refetches from DB when cache is older than 1 day', async () => {
    const stale = { data: [{ cookidoo_id: 'old' }], ts: Date.now() - 25 * 60 * 60 * 1000 }
    chrome.storage.local.get.mockResolvedValue({ mc_trending_cache: stale })
    mockRpc.mockResolvedValue({ data: [{ cookidoo_id: 'new' }], error: null })
    const { handleGetTrending } = await import('../../src/service-worker/api')
    const result = await handleGetTrending()
    expect(mockRpc).toHaveBeenCalled()
    expect(result.data).toEqual([{ cookidoo_id: 'new' }])
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
