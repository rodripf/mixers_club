import type { Review, ReviewType } from '../../types'
import { gravatarUrl } from '../dom-helpers'

const TYPES: ReviewType[] = ['improvement', 'variation', 'comment', 'warning', 'other']

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildStars(stars: number): string {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="core-rating__point${i < stars ? ' core-rating__point--full' : ''}"></span>`
  ).join('')
}

export function renderReviewCard(review: Review): HTMLElement {
  const tile = document.createElement('core-tile')
  tile.setAttribute('data-review-id', review.id)
  tile.setAttribute('data-type', review.type)
  tile.innerHTML = `
    <div class="core-tile__description-wrapper">
      <div class="core-tile__description">
        <img src="${gravatarUrl(review.email, 48)}" alt="" width="48" height="48">
        <p class="core-tile__description-text">
          <strong id="mc-username-${review.id}"></strong>
          <span style="margin-left:8px;text-transform:capitalize;">${review.type}</span>
        </p>
        <core-rating>
          <div class="core-rating__rating-list">${buildStars(review.stars)}</div>
        </core-rating>
        <p class="core-tile__description-subline">${escapeHtml(review.body)}</p>
        <div>
          <button
            class="core-chip-button core-chip-button--flat core-chip-button--x-small mc-vote-btn"
            data-review-id="${review.id}" data-value="1"
            ${review.user_vote === 1 ? 'disabled' : ''}>
            +${review.likes}
          </button>
          <button
            class="core-chip-button core-chip-button--flat core-chip-button--x-small mc-vote-btn"
            data-review-id="${review.id}" data-value="-1"
            ${review.user_vote === -1 ? 'disabled' : ''}>
            -${review.dislikes}
          </button>
        </div>
      </div>
    </div>
  `
  // Set username via textContent to prevent XSS
  const usernameEl = tile.querySelector(`#mc-username-${review.id}`)
  if (usernameEl) usernameEl.textContent = review.username
  return tile
}

export function applyFilter(type: ReviewType | 'all'): void {
  document.querySelectorAll<HTMLElement>('core-tile[data-type]').forEach(tile => {
    const match = type === 'all' || tile.dataset['type'] === type
    tile.style.display = match ? '' : 'none'
  })
}

export function buildReviewsSection(reviews: Review[], authenticated: boolean): HTMLElement {
  const section = document.createElement('section')
  section.className = 'wf-spacing-bottom'
  section.id = 'mixers-club-reviews'

  const filterButtons = ['all', ...TYPES].map(t =>
    `<button class="core-chip-button core-chip-button--flat core-chip-button--x-small${t === 'all' ? ' core-chip-button--active' : ''}" data-mc-filter="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
  ).join('')

  section.innerHTML = `
    <core-stripe class="core-stripe--modern" role="region" aria-labelledby="mc-stripe-header">
      <h3 class="core-stripe__header" id="mc-stripe-header">Mixers Club's Reviews</h3>
      <div id="mc-filter-chips" style="margin-bottom:8px">${filterButtons}</div>
      <div class="core-stripe__content" id="mc-reviews-content"></div>
      ${authenticated
        ? `<button class="button--primary" id="mc-add-review" style="margin-top:12px">Add your review</button>`
        : `<button class="button--primary" id="mc-login-to-review" style="margin-top:12px">Login to review</button>`}
    </core-stripe>
  `

  const content = section.querySelector('#mc-reviews-content')!
  reviews.forEach(r => content.appendChild(renderReviewCard(r)))

  // Filter chip interaction
  section.querySelector('#mc-filter-chips')!.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-mc-filter]')
    if (!btn) return
    section.querySelectorAll('[data-mc-filter]').forEach(b =>
      b.classList.remove('core-chip-button--active'))
    btn.classList.add('core-chip-button--active')
    applyFilter(btn.dataset['mcFilter'] as ReviewType | 'all')
  })

  return section
}
