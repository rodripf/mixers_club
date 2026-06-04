import { detectPage, extractRecipeId } from './page-detector'
import { initRecipePage } from './recipe-page/index'
import { initHomePage } from './home-page/index'

const pageType = detectPage(window.location.pathname)

if (pageType === 'recipe') {
  const recipeId = extractRecipeId(window.location.pathname)
  if (recipeId) initRecipePage(recipeId, window.location.hostname)
} else if (pageType === 'home') {
  initHomePage(window.location.hostname)
}
