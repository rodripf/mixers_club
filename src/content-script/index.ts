import type { Message } from '../types'
import { detectPage, extractRecipeId } from './page-detector'
import { initRecipePage } from './recipe-page/index'
import { initHomePage } from './home-page/index'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

// Handle Supabase magic link redirect — hash contains access_token when
// Supabase redirects back to the Cookidoo page after verification
if (window.location.hash.includes('access_token=')) {
  const token = window.location.hash.slice(1)
  history.replaceState(null, '', window.location.pathname + window.location.search)
  send({ action: 'authCallback', token }).then(() => location.reload())
} else {
  const pageType = detectPage(window.location.pathname)
  if (pageType === 'recipe') {
    const recipeId = extractRecipeId(window.location.pathname)
    if (recipeId) initRecipePage(recipeId, window.location.hostname)
  } else if (pageType === 'home') {
    initHomePage(window.location.hostname)
  }
}
