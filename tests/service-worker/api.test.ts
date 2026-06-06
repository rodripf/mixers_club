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

describe('handleAddReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts recipe with ignoreDuplicates: true to prevent data poisoning', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'recipe-id' }, error: null })
    const mockSelectRecipe = vi.fn().mockReturnValue({ single: mockSingle })
    const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectRecipe })

    const mockSingleRev = vi.fn().mockResolvedValue({
      data: { id: 'rev-id', recipe_id: 'recipe-id', user_id: 'uid-1', type: 'comment', body: 'good', stars: 5, created_at: '' },
      error: null,
    })
    const mockSelectRev = vi.fn().mockReturnValue({ single: mockSingleRev })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelectRev })

    const mockSingleUser = vi.fn().mockResolvedValue({ data: { username: 'u', email_hash: 'abc' }, error: null })
    const mockEqUser = vi.fn().mockReturnValue({ single: mockSingleUser })
    const mockSelectUser = vi.fn().mockReturnValue({ eq: mockEqUser })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') return { upsert: mockUpsert }
      if (table === 'reviews') return { insert: mockInsert }
      if (table === 'users') return { select: mockSelectUser }
      return {}
    })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleAddReview } = await import('../../src/service-worker/api')
    await handleAddReview({
      action: 'addReview', cookidooId: 'r1', domain: 'cookidoo.es',
      recipeName: 'Test', type: 'comment', stars: 5, body: 'good',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ cookidoo_id: 'r1' }),
      expect.objectContaining({ onConflict: 'cookidoo_id,domain', ignoreDuplicates: true })
    )
  })

  it('falls back to SELECT when recipe already exists (ignoreDuplicates returns no rows)', async () => {
    // upsert returns null (recipe existed, INSERT was skipped)
    const mockSingleUpsert = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockSelectRecipeUpsert = vi.fn().mockReturnValue({ single: mockSingleUpsert })
    const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectRecipeUpsert })

    // fallback SELECT returns the existing recipe id
    const mockSingleSelect = vi.fn().mockResolvedValue({ data: { id: 'existing-recipe-id' }, error: null })
    const mockEqSelect2 = vi.fn().mockReturnValue({ single: mockSingleSelect })
    const mockEqSelect1 = vi.fn().mockReturnValue({ eq: mockEqSelect2 })
    const mockSelectFallback = vi.fn().mockReturnValue({ eq: mockEqSelect1 })

    const mockSingleRev = vi.fn().mockResolvedValue({
      data: { id: 'rev-id', recipe_id: 'existing-recipe-id', user_id: 'uid-1', type: 'comment', body: 'good', stars: 5, created_at: '' },
      error: null,
    })
    const mockSelectRev = vi.fn().mockReturnValue({ single: mockSingleRev })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelectRev })

    const mockSingleUser = vi.fn().mockResolvedValue({ data: { username: 'u', email_hash: 'abc' }, error: null })
    const mockEqUser = vi.fn().mockReturnValue({ single: mockSingleUser })
    const mockSelectUser = vi.fn().mockReturnValue({ eq: mockEqUser })

    let recipesCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'recipes') {
        recipesCallCount++
        if (recipesCallCount === 1) return { upsert: mockUpsert }       // first call: upsert
        return { select: mockSelectFallback }                            // second call: fallback SELECT
      }
      if (table === 'reviews') return { insert: mockInsert }
      if (table === 'users') return { select: mockSelectUser }
      return {}
    })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleAddReview } = await import('../../src/service-worker/api')
    const result = await handleAddReview({
      action: 'addReview', cookidooId: 'r1', domain: 'cookidoo.es',
      recipeName: 'Test', type: 'comment', stars: 5, body: 'good',
    })

    expect(result.error).toBeNull()
    expect(mockSelectFallback).toHaveBeenCalled()
  })

  it('returns error immediately when upsert fails with a real error (not PGRST116)', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table recipes' },
    })
    const mockSelectRecipe = vi.fn().mockReturnValue({ single: mockSingle })
    const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectRecipe })
    mockFrom.mockReturnValue({ upsert: mockUpsert })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleAddReview } = await import('../../src/service-worker/api')
    const result = await handleAddReview({
      action: 'addReview', cookidooId: 'r1', domain: 'cookidoo.es',
      recipeName: 'Test', type: 'comment', stars: 5, body: 'good',
    })

    expect(result.error).toBe('permission denied for table recipes')
    expect(mockFrom).toHaveBeenCalledTimes(1) // no fallback SELECT triggered
  })
})

describe('handleUpdateReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalidates cache and returns success when review is owned by user', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'rev-uuid' }], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ update: mockUpdate })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleUpdateReview } = await import('../../src/service-worker/api')
    const result = await handleUpdateReview({
      action: 'updateReview', reviewId: 'rev-uuid', cookidooId: 'r1',
      type: 'comment', stars: 5, body: 'updated body',
    })

    expect(result.error).toBeNull()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('mc_reviews_r1')
  })

  it('returns error and does NOT invalidate cache when 0 rows matched (IDOR attempt)', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ update: mockUpdate })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleUpdateReview } = await import('../../src/service-worker/api')
    const result = await handleUpdateReview({
      action: 'updateReview', reviewId: 'other-users-rev', cookidooId: 'r1',
      type: 'comment', stars: 1, body: 'malicious',
    })

    expect(result.error).toBe('Review not found or not yours')
    expect(chrome.storage.local.remove).not.toHaveBeenCalled()
  })
})

describe('handleDeleteReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalidates cache and returns success when review is owned by user', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'rev-uuid' }], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleDeleteReview } = await import('../../src/service-worker/api')
    const result = await handleDeleteReview({
      action: 'deleteReview', reviewId: 'rev-uuid', cookidooId: 'r1',
    })

    expect(result.error).toBeNull()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('mc_reviews_r1')
  })

  it('returns error and does NOT invalidate cache when 0 rows matched (IDOR attempt)', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1' } } }, error: null })

    const { handleDeleteReview } = await import('../../src/service-worker/api')
    const result = await handleDeleteReview({
      action: 'deleteReview', reviewId: 'other-users-rev', cookidooId: 'r1',
    })

    expect(result.error).toBe('Review not found or not yours')
    expect(chrome.storage.local.remove).not.toHaveBeenCalled()
  })
})

describe('handleSetUsername', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects usernames longer than 30 characters', async () => {
    const { handleSetUsername } = await import('../../src/service-worker/auth')
    const result = await handleSetUsername('a'.repeat(31))
    expect(result.error).toBe('Username must be 30 characters or fewer')
  })

  it('rejects usernames with invalid characters', async () => {
    const { handleSetUsername } = await import('../../src/service-worker/auth')
    const result = await handleSetUsername('bad username!')
    expect(result.error).toBe('Username can only contain letters, numbers, underscores, and hyphens')
  })

  it('accepts valid usernames (letters, numbers, underscores, hyphens)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'uid-1', email: 'a@b.com' } } }, error: null })
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert: mockUpsert })
    const { handleSetUsername } = await import('../../src/service-worker/auth')
    const result = await handleSetUsername('chef_rodriguez-99')
    expect(result.error).toBeNull()
  })
})
