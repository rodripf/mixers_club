import type { Message, MessageResponse, Review, TrendingRecipe } from '../types'
import { supabase } from './supabase'

const REVIEWS_TTL = 24 * 60 * 60 * 1000 // 1 day

function reviewsCacheKey(cookidooId: string): string {
  return `mc_reviews_${cookidooId}`
}

async function getCachedReviews(cookidooId: string): Promise<Review[] | null> {
  const key = reviewsCacheKey(cookidooId)
  const stored = await chrome.storage.local.get(key)
  const cached = stored[key] as { data: Review[]; ts: number } | undefined
  if (cached && Date.now() - cached.ts < REVIEWS_TTL) return cached.data
  return null
}

async function cacheReviews(cookidooId: string, data: Review[]): Promise<void> {
  await chrome.storage.local.set({ [reviewsCacheKey(cookidooId)]: { data, ts: Date.now() } })
}

async function invalidateReviewsCache(cookidooId: string): Promise<void> {
  await chrome.storage.local.remove(reviewsCacheKey(cookidooId))
}

function isHidden(review: Review): boolean {
  const netScore = review.likes - review.dislikes
  const total = review.likes + review.dislikes
  const dislikeRatio = total > 0 ? review.dislikes / total : 0
  return netScore < -3 && dislikeRatio > 0.5
}

export async function handleGetReviews(cookidooId: string): Promise<MessageResponse<Review[]>> {
  const cached = await getCachedReviews(cookidooId)
  if (cached) return { data: cached, error: null }

  const { data, error } = await supabase.rpc('get_reviews_for_recipe', {
    p_cookidoo_id: cookidooId,
  })
  if (error) return { data: null, error: error.message }
  const visible = (data as Review[]).filter(r => !isHidden(r))
  await cacheReviews(cookidooId, visible)
  return { data: visible, error: null }
}

export async function handleAddReview(
  msg: Extract<Message, { action: 'addReview' }>
): Promise<MessageResponse<Review>> {
  // Upsert recipe row
  const { data: upsertedRecipe, error: upsertErr } = await supabase
    .from('recipes')
    .upsert(
      { cookidoo_id: msg.cookidooId, domain: msg.domain, name: msg.recipeName, image_url: msg.imageUrl ?? null },
      { onConflict: 'cookidoo_id,domain', ignoreDuplicates: true }
    )
    .select('id')
    .single()

  // PGRST116 = no rows returned = recipe already existed (ignoreDuplicates skipped the INSERT)
  // Any other error is a real failure — return it immediately
  if (upsertErr && upsertErr.code !== 'PGRST116') {
    return { data: null, error: upsertErr.message }
  }

  // ignoreDuplicates returns no rows when the recipe already exists (PGRST116).
  // Fall back to a SELECT to get the existing ID.
  let recipe: { id: string } | null = upsertedRecipe
  if (!recipe) {
    const { data: existing, error: selectErr } = await supabase
      .from('recipes')
      .select('id')
      .eq('cookidoo_id', msg.cookidooId)
      .eq('domain', msg.domain)
      .single()
    if (selectErr) return { data: null, error: selectErr.message }
    recipe = existing
  }
  if (!recipe) return { data: null, error: 'Recipe not found' }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

  const { data: review, error: reviewErr } = await supabase
    .from('reviews')
    .insert({
      recipe_id: recipe.id,
      user_id: sessionData.session.user.id,
      type: msg.type,
      body: msg.body,
      stars: msg.stars,
    })
    .select('id, recipe_id, user_id, type, body, stars, created_at')
    .single()
  if (reviewErr) return { data: null, error: reviewErr.message }

  await invalidateReviewsCache(msg.cookidooId)

  // Fetch username + email for immediate card rendering
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('username, email_hash')
    .eq('id', sessionData.session.user.id)
    .single()
  if (profileErr) console.error('[Mixers Club] profile fetch after review insert:', profileErr.message)

  return {
    data: {
      ...review,
      username: profile?.username ?? '',
      email_hash: profile?.email_hash ?? '',
      likes: 0,
      dislikes: 0,
      user_vote: null,
    } as Review,
    error: null,
  }
}

export async function handleVote(reviewId: string, value: 1 | -1 | 0): Promise<MessageResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

  if (value === 0) {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', sessionData.session.user.id)
    if (error) return { data: null, error: error.message }
  } else {
    const { error } = await supabase
      .from('votes')
      .upsert(
        { review_id: reviewId, user_id: sessionData.session.user.id, value },
        { onConflict: 'review_id,user_id' }
      )
    if (error) return { data: null, error: error.message }
  }
  return { data: undefined, error: null }
}

export async function handleUpdateReview(
  msg: Extract<Message, { action: 'updateReview' }>
): Promise<MessageResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('reviews')
    .update({ type: msg.type, body: msg.body, stars: msg.stars })
    .eq('id', msg.reviewId)
    .eq('user_id', sessionData.session.user.id)
    .select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Review not found or not yours' }
  await invalidateReviewsCache(msg.cookidooId)
  return { data: undefined, error: null }
}

export async function handleDeleteReview(
  msg: Extract<Message, { action: 'deleteReview' }>
): Promise<MessageResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', msg.reviewId)
    .eq('user_id', sessionData.session.user.id)
    .select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Review not found or not yours' }
  await invalidateReviewsCache(msg.cookidooId)
  return { data: undefined, error: null }
}

const TRENDING_CACHE_KEY = 'mc_trending_cache'
const TRENDING_TTL = 24 * 60 * 60 * 1000 // 1 day

export async function handleGetTrending(): Promise<MessageResponse<TrendingRecipe[]>> {
  const stored = await chrome.storage.local.get(TRENDING_CACHE_KEY)
  const cached = stored[TRENDING_CACHE_KEY] as { data: TrendingRecipe[]; ts: number } | undefined
  if (cached && Date.now() - cached.ts < TRENDING_TTL) {
    return { data: cached.data, error: null }
  }

  const { data, error } = await supabase.rpc('get_trending_recipes', { p_limit: 10 })
  if (error) return { data: null, error: error.message }

  await chrome.storage.local.set({ [TRENDING_CACHE_KEY]: { data, ts: Date.now() } })
  return { data: data as TrendingRecipe[], error: null }
}
