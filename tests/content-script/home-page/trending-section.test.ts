import { describe, it, expect } from 'vitest'
import type { TrendingRecipe } from '../../../src/types'
import { buildTrendingSection } from '../../../src/content-script/home-page/trending-section'

const recipe: TrendingRecipe = {
  cookidoo_id: 'r268795', domain: 'cookidoo.co.uk',
  name: 'Lentil Curry', avg_stars: 4.5, review_count: 23, score: 14.2,
}

describe('buildTrendingSection', () => {
  it('creates a section with id mixers-club-trending', () => {
    const section = buildTrendingSection([])
    expect(section.id).toBe('mixers-club-trending')
  })

  it('renders one article tile per recipe', () => {
    const section = buildTrendingSection([recipe])
    expect(section.querySelectorAll('article').length).toBe(1)
  })

  it('includes the recipe name in the tile', () => {
    const section = buildTrendingSection([recipe])
    expect(section.textContent).toContain('Lentil Curry')
  })

  it('links to the correct Cookidoo recipe URL using current locale', () => {
    // jsdom sets window.location.pathname to '/'
    const section = buildTrendingSection([recipe])
    const link = section.querySelector<HTMLAnchorElement>('a')!
    expect(link.getAttribute('href')).toContain('r268795')
  })

  it('shows avg_stars and review_count', () => {
    const section = buildTrendingSection([recipe])
    expect(section.textContent).toContain('4.5')
    expect(section.textContent).toContain('23')
  })

  it('shows a message when no trending recipes', () => {
    const section = buildTrendingSection([])
    expect(section.textContent).toContain('No trending')
  })
})
