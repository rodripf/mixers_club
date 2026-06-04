import type { Message, MessageResponse, Review, TrendingRecipe } from '../types'
export async function handleGetReviews(_id: string, _domain: string): Promise<MessageResponse<Review[]>> { return { data: [], error: null } }
export async function handleAddReview(_msg: Extract<Message, { action: 'addReview' }>): Promise<MessageResponse<Review>> { return { data: null, error: 'not implemented' } }
export async function handleVote(_reviewId: string, _value: 1 | -1): Promise<MessageResponse> { return { data: undefined, error: null } }
export async function handleGetTrending(): Promise<MessageResponse<TrendingRecipe[]>> { return { data: [], error: null } }
