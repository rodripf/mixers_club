import type { TrendingRecipe } from '../../types'

function getLocaleFromPath(): string {
  const match = window.location.pathname.match(/\/foundation\/([^/]+)/)
  return match?.[1] ?? 'en-GB'
}

function buildRecipeTile(recipe: TrendingRecipe): HTMLElement {
  const locale = getLocaleFromPath()
  const tile = document.createElement('core-tile')
  const link = document.createElement('a')
  link.className = 'link--alt'
  link.href = `/recipes/recipe/${locale}/${recipe.cookidoo_id}`

  const wrapper = document.createElement('div')
  wrapper.className = 'core-tile__description-wrapper'
  const desc = document.createElement('div')
  desc.className = 'core-tile__description'

  const nameEl = document.createElement('p')
  nameEl.className = 'core-tile__description-text'
  nameEl.textContent = recipe.name ?? recipe.cookidoo_id

  const rating = document.createElement('core-rating')
  rating.className = 'core-rating--short core-rating--small'
  rating.innerHTML = `
    <span class="core-rating__counter">${recipe.avg_stars}</span>
    <span class="core-rating__point core-rating__point--full"></span>
    <span class="core-rating__label">(${recipe.review_count})</span>
  `

  desc.appendChild(nameEl)
  desc.appendChild(rating)
  wrapper.appendChild(desc)
  link.appendChild(wrapper)
  tile.appendChild(link)
  return tile
}

export function buildTrendingSection(recipes: TrendingRecipe[]): HTMLElement {
  const section = document.createElement('section')
  section.className = 'wf-spacing-bottom'
  section.id = 'mixers-club-trending'

  const stripe = document.createElement('core-stripe')
  stripe.className = 'core-stripe--modern'
  stripe.setAttribute('role', 'region')
  stripe.setAttribute('aria-labelledby', 'mc-trending-header')

  const header = document.createElement('h3')
  header.className = 'core-stripe__header'
  header.id = 'mc-trending-header'
  header.textContent = 'Mixers Club — Trending This Month'

  const content = document.createElement('div')
  content.className = 'core-stripe__content'
  content.id = 'mc-trending-content'

  if (recipes.length > 0) {
    recipes.forEach(r => content.appendChild(buildRecipeTile(r)))
  } else {
    const msg = document.createElement('p')
    msg.style.padding = '16px'
    msg.textContent = 'No trending recipes this month yet. Be the first to review!'
    content.appendChild(msg)
  }

  stripe.appendChild(header)
  stripe.appendChild(content)
  section.appendChild(stripe)
  return section
}
