export type ReviewType = 'improvement' | 'variation' | 'comment' | 'warning' | 'other'

export interface Review {
  id: string
  recipe_id: string
  user_id: string
  type: ReviewType
  body: string
  stars: number
  created_at: string
  username: string
  email_hash: string
  likes: number
  dislikes: number
  user_vote: 1 | -1 | null
}

export interface TrendingRecipe {
  cookidoo_id: string
  domain: string
  name: string | null
  avg_stars: number
  review_count: number
  score: number
  image_url?: string | null
}

// All messages from content script to service worker
export type Message =
  | { action: 'sendMagicLink'; email: string }
  | { action: 'authCallback'; token: string }
  | { action: 'getSession' }
  | { action: 'signOut' }
  | { action: 'getReviews'; cookidooId: string }
  | { action: 'addReview'; cookidooId: string; domain: string; recipeName: string; type: ReviewType; stars: number; body: string; imageUrl?: string | null }
  | { action: 'vote'; reviewId: string; value: 1 | -1 | 0 }
  | { action: 'updateReview'; reviewId: string; cookidooId: string; type: ReviewType; stars: number; body: string }
  | { action: 'deleteReview'; reviewId: string; cookidooId: string }
  | { action: 'getTrending' }
  | { action: 'setUsername'; username: string }

export interface Session {
  userId: string
  username: string | null
  email: string
  accessToken: string
  refreshToken: string
}

export type MessageResponse<T = void> =
  | { data: T; error: null }
  | { data: null; error: string }
