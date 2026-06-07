import type { Message, TrendingRecipe } from '../../types'
import { waitForElement } from '../dom-helpers'
import { buildTrendingSection } from './trending-section'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

function getLocale(): string {
  const match = window.location.pathname.match(/\/foundation\/([^/]+)/)
  return match?.[1] ?? 'en-GB'
}

async function fetchOfficialRating(locale: string, cookidooId: string): Promise<string | null> {
  try {
    const resp = await fetch(`/recipes/recipe/${locale}/${cookidooId}`, { credentials: 'include' })
    const html = await resp.text()
    const match = html.match(/class="core-rating__counter[^"]*"[^>]*>([^<]+)</)
    return match ? match[1]!.trim() : null
  } catch {
    return null
  }
}

async function patchOfficialRatings(section: HTMLElement, recipes: TrendingRecipe[], locale: string): Promise<void> {
  const results = await Promise.all(
    recipes.map(r => fetchOfficialRating(locale, r.cookidoo_id).then(rating => ({ id: r.cookidoo_id, rating })))
  )
  for (const { id, rating } of results) {
    if (!rating) continue
    const counter = section.querySelector<HTMLElement>(`[data-cookidoo-id="${id}"] .mc-tile-counter`)
    if (counter) counter.textContent = rating
  }
}

export async function initHomePage(_domain: string): Promise<void> {
  try {
    const hero = await waitForElement('wf-rendering-synchronizer wf-hero-component')
    const heroSection = hero.closest('section')!
    const container = heroSection.parentElement!

    const result = await send<TrendingRecipe[]>({ action: 'getTrending' })
    const recipes = result.data ?? []

    const locale = getLocale()
    const section = buildTrendingSection(recipes)
    container.insertBefore(section, heroSection.nextSibling)

    if (recipes.length > 0) {
      patchOfficialRatings(section, recipes, locale)
    }
  } catch (err) {
    // waitForElement already logged the timeout error
  }
}
