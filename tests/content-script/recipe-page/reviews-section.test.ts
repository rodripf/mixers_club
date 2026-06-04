import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Review } from '../../../src/types'
import { buildReviewsSection, renderReviewCard, applyFilter } from '../../../src/content-script/recipe-page/reviews-section'

const baseReview: Review = {
  id: 'rv-1', recipe_id: 'rec-1', user_id: 'u-1',
  type: 'comment', body: 'Great dish!', stars: 4,
  created_at: '2026-06-01T00:00:00Z',
  username: 'chef99', email: 'chef@example.com',
  likes: 5, dislikes: 1, user_vote: null,
}

describe('buildReviewsSection', () => {
  it('creates a section with id mixers-club-reviews', () => {
    const section = buildReviewsSection([], false)
    expect(section.id).toBe('mixers-club-reviews')
  })

  it('shows "Add your review" button when authenticated', () => {
    const section = buildReviewsSection([], true)
    expect(section.querySelector('#mc-add-review')).toBeTruthy()
    expect(section.querySelector('#mc-login-to-review')).toBeNull()
  })

  it('shows "Login to review" button when not authenticated', () => {
    const section = buildReviewsSection([], false)
    expect(section.querySelector('#mc-login-to-review')).toBeTruthy()
    expect(section.querySelector('#mc-add-review')).toBeNull()
  })

  it('renders review cards in the stripe content', () => {
    const section = buildReviewsSection([baseReview], true)
    const tiles = section.querySelectorAll('core-tile')
    expect(tiles.length).toBe(1)
  })
})

describe('renderReviewCard', () => {
  it('displays username, body, and stars', () => {
    const tile = renderReviewCard(baseReview)
    expect(tile.outerHTML).toContain('chef99')
    expect(tile.outerHTML).toContain('Great dish!')
    // 4 full stars
    const fullStars = tile.querySelectorAll('.core-rating__point--full')
    expect(fullStars.length).toBe(4)
  })

  it('includes gravatar img with identicon fallback', () => {
    const tile = renderReviewCard(baseReview)
    const img = tile.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('gravatar.com/avatar/')
    expect(img.src).toContain('d=identicon')
  })

  it('shows like and dislike counts', () => {
    const tile = renderReviewCard(baseReview)
    expect(tile.textContent).toContain('5')
    expect(tile.textContent).toContain('1')
  })
})

describe('applyFilter', () => {
  it('shows all tiles when filter is "all"', () => {
    document.body.innerHTML = `
      <core-tile data-type="comment"></core-tile>
      <core-tile data-type="warning"></core-tile>
    `
    applyFilter('all')
    const tiles = document.querySelectorAll('core-tile')
    tiles.forEach(t => expect((t as HTMLElement).style.display).not.toBe('none'))
  })

  it('hides tiles that do not match the filter type', () => {
    document.body.innerHTML = `
      <core-tile data-type="comment"></core-tile>
      <core-tile data-type="warning"></core-tile>
    `
    applyFilter('warning')
    expect(((document.querySelector('[data-type="comment"]') as HTMLElement).style.display)).toBe('none')
    expect(((document.querySelector('[data-type="warning"]') as HTMLElement).style.display)).not.toBe('none')
  })
})
