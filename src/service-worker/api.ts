import type { Message, MessageResponse, Review, TrendingRecipe } from '../types'
import { supabase } from './supabase'

function isHidden(review: Review): boolean {
  const netScore = review.likes - review.dislikes
  const total = review.likes + review.dislikes
  const dislikeRatio = total > 0 ? review.dislikes / total : 0
  return netScore < -3 && dislikeRatio > 0.5
}

export async function handleGetReviews(cookidooId: string, domain: string): Promise<MessageResponse<Review[]>> {
  const { data, error } = await supabase.rpc('get_reviews_for_recipe', {
    p_cookidoo_id: cookidooId,
    p_domain: domain,
  })
  if (error) return { data: null, error: error.message }
  const visible = (data as Review[]).filter(r => !isHidden(r))
  return { data: visible, error: null }
}

export async function handleAddReview(
  msg: Extract<Message, { action: 'addReview' }>
): Promise<MessageResponse<Review>> {
  // Upsert recipe row
  const { data: recipe, error: recipeErr } = await supabase
    .from('recipes')
    .upsert(
      { cookidoo_id: msg.cookidooId, domain: msg.domain, name: msg.recipeName },
      { onConflict: 'cookidoo_id,domain' }
    )
    .select('id')
    .single()
  if (recipeErr) return { data: null, error: recipeErr.message }

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

  // Fetch username + email for immediate card rendering
  const { data: profile } = await supabase
    .from('users')
    .select('username, email')
    .eq('id', sessionData.session.user.id)
    .single()

  return {
    data: {
      ...review,
      username: profile?.username ?? '',
      email: profile?.email ?? '',
      likes: 0,
      dislikes: 0,
      user_vote: null,
    } as Review,
    error: null,
  }
}

export async function handleVote(reviewId: string, value: 1 | -1): Promise<MessageResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!sessionData.session) return { data: null, error: 'Not authenticated' }

  const { error } = await supabase
    .from('votes')
    .upsert(
      { review_id: reviewId, user_id: sessionData.session.user.id, value },
      { onConflict: 'review_id,user_id' }
    )
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}

export async function handleGetTrending(): Promise<MessageResponse<TrendingRecipe[]>> {
  const { data, error } = await supabase.rpc('get_trending_recipes', { p_limit: 10 })
  if (error) return { data: null, error: error.message }
  return { data: data as TrendingRecipe[], error: null }
}
