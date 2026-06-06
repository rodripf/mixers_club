import type { Message, MessageResponse } from '../types'
import { handleSendMagicLink, handleAuthCallback, handleGetSession, handleSignOut, handleSetUsername } from './auth'
import { handleGetReviews, handleAddReview, handleVote, handleUpdateReview, handleDeleteReview, handleGetTrending } from './api'
import { supabase } from './supabase'

export async function handleMessage(message: Message): Promise<MessageResponse<unknown>> {
  try {
    switch (message.action) {
      case 'sendMagicLink':  return handleSendMagicLink(message.email)
      case 'authCallback':   return handleAuthCallback(message.token)
      case 'getSession':     return handleGetSession()
      case 'signOut':        return handleSignOut()
      case 'setUsername':    return handleSetUsername(message.username)
      case 'getReviews':     return handleGetReviews(message.cookidooId)
      case 'addReview':      return handleAddReview(message)
      case 'vote':           return handleVote(message.reviewId, message.value)
      case 'updateReview':   return handleUpdateReview(message)
      case 'deleteReview':   return handleDeleteReview(message)
      case 'getTrending':    return handleGetTrending()
      default: {
        const exhaustive: never = message
        return { data: null, error: `Unknown action: ${(message as { action: string }).action}` }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Mixers Club SW]', msg)
    return { data: null, error: msg }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message as Message)
    .then(sendResponse)
    .catch((err) => sendResponse({ data: null, error: String(err) }))
  return true
})

// MV3 service workers can be killed and restarted at any time.
// Re-initialize auto-refresh on each startup so tokens don't expire silently.
supabase.auth.startAutoRefresh()
