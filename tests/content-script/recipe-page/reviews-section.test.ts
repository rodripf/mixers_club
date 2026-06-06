import { describe, it, expect } from 'vitest'
import type { Review } from '../../../src/types'
import {
  buildReviewsSection,
  renderReviewCard,
  applyFilter,
  setVoteButtonStyle,
} from '../../../src/content-script/recipe-page/reviews-section'

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

  it('renders one review card per review', () => {
    const section = buildReviewsSection([baseReview], true)
    expect(section.querySelectorAll('[data-mc-review]').length).toBe(1)
  })

  it('shows empty state when there are no reviews', () => {
    const section = buildReviewsSection([], false)
    expect(section.querySelector('#mc-reviews-content')!.textContent).toContain('No reviews yet')
  })

  it('shows sign-out button with username when authenticated and username provided', () => {
    const section = buildReviewsSection([], true, 'u-1', 'chef99')
    expect(section.querySelector('#mc-sign-out')).toBeTruthy()
    expect(section.textContent).toContain('chef99')
  })

  it('calls onSignOut when sign-out button is clicked', () => {
    let called = false
    const section = buildReviewsSection([], true, 'u-1', 'chef99', () => { called = true })
    ;(section.querySelector<HTMLButtonElement>('#mc-sign-out'))!.click()
    expect(called).toBe(true)
  })

  it('does not show sign-out button when not authenticated', () => {
    const section = buildReviewsSection([], false, undefined, undefined)
    expect(section.querySelector('#mc-sign-out')).toBeNull()
  })
})

describe('renderReviewCard', () => {
  it('displays username and body text', () => {
    const card = renderReviewCard(baseReview)
    expect(card.textContent).toContain('chef99')
    expect(card.textContent).toContain('Great dish!')
  })

  it('renders 5 star spans — 4 filled, 1 empty', () => {
    const card = renderReviewCard(baseReview)
    const starSpans = [...card.querySelectorAll('span')].filter(s => s.textContent === '★')
    expect(starSpans.length).toBe(5)
    const filled = starSpans.filter(s => s.style.color === 'rgb(245, 158, 11)')
    expect(filled.length).toBe(4)
  })

  it('sets body text via textContent (XSS safe)', () => {
    const xss: Review = { ...baseReview, body: '<script>alert(1)</script>' }
    const card = renderReviewCard(xss)
    expect(card.innerHTML).not.toContain('<script>')
    expect(card.textContent).toContain('<script>alert(1)</script>')
  })

  it('shows thumbs up/down vote counts', () => {
    const card = renderReviewCard(baseReview)
    expect(card.textContent).toContain('👍 5')
    expect(card.textContent).toContain('👎 1')
  })

  it('has data-mc-review, data-type, data-review-id and data-user-vote', () => {
    const card = renderReviewCard(baseReview)
    expect(card.dataset['mcReview']).toBe('1')
    expect(card.dataset['type']).toBe('comment')
    expect(card.dataset['reviewId']).toBe('rv-1')
    expect(card.dataset['userVote']).toBe('')
  })

  it('stores user_vote in data-user-vote when present', () => {
    const voted: Review = { ...baseReview, user_vote: 1 }
    const card = renderReviewCard(voted)
    expect(card.dataset['userVote']).toBe('1')
  })

  it('shows edit and delete buttons only for own review', () => {
    const own = renderReviewCard(baseReview, 'u-1')
    const other = renderReviewCard(baseReview, 'u-2')
    expect(own.querySelector('.mc-edit-btn')).toBeTruthy()
    expect(own.querySelector('.mc-delete-btn')).toBeTruthy()
    expect(other.querySelector('.mc-edit-btn')).toBeNull()
    expect(other.querySelector('.mc-delete-btn')).toBeNull()
  })

  it('no edit or delete buttons when currentUserId is not provided', () => {
    const card = renderReviewCard(baseReview)
    expect(card.querySelector('.mc-edit-btn')).toBeNull()
    expect(card.querySelector('.mc-delete-btn')).toBeNull()
  })

  it('includes gravatar img with identicon fallback', () => {
    const card = renderReviewCard(baseReview)
    const img = card.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('gravatar.com/avatar/')
    expect(img.src).toContain('d=identicon')
  })
})

describe('setVoteButtonStyle', () => {
  it('applies green highlight to active like button', () => {
    const btn = document.createElement('button')
    btn.dataset['value'] = '1'
    setVoteButtonStyle(btn, true)
    expect(btn.style.backgroundColor).toBe('rgb(220, 252, 231)')
  })

  it('clears styles when inactive', () => {
    const btn = document.createElement('button')
    btn.dataset['value'] = '1'
    setVoteButtonStyle(btn, true)
    setVoteButtonStyle(btn, false)
    expect(btn.style.backgroundColor).toBe('')
  })
})

describe('applyFilter', () => {
  it('shows all cards when filter is "all"', () => {
    document.body.innerHTML = `
      <div data-mc-review="1" data-type="comment"></div>
      <div data-mc-review="1" data-type="warning"></div>
    `
    applyFilter('all')
    document.querySelectorAll<HTMLElement>('[data-mc-review]').forEach(c =>
      expect(c.style.display).not.toBe('none')
    )
  })

  it('hides cards that do not match the filter type', () => {
    document.body.innerHTML = `
      <div data-mc-review="1" data-type="comment"></div>
      <div data-mc-review="1" data-type="warning"></div>
    `
    applyFilter('warning')
    expect((document.querySelector('[data-type="comment"]') as HTMLElement).style.display).toBe('none')
    expect((document.querySelector('[data-type="warning"]') as HTMLElement).style.display).not.toBe('none')
  })
})

