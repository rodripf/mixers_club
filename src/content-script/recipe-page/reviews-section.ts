import type { Review, ReviewType } from '../../types'
import { gravatarUrl, translateText } from '../dom-helpers'
import { t } from '../../i18n'

export const REVIEW_TYPES: ReviewType[] = ['improvement', 'variation', 'comment', 'warning', 'other']

const TYPE_COLORS: Record<ReviewType, { bg: string; fg: string }> = {
  improvement: { bg: '#dbeafe', fg: '#1d4ed8' },
  variation:   { bg: '#f3e8ff', fg: '#7e22ce' },
  comment:     { bg: '#dcfce7', fg: '#15803d' },
  warning:     { bg: '#fef9c3', fg: '#854d0e' },
  other:       { bg: '#f1f5f9', fg: '#475569' },
}

function buildStarSpans(count: number): HTMLSpanElement[] {
  return Array.from({ length: 5 }, (_, i) => {
    const span = document.createElement('span')
    span.textContent = '★'
    span.style.color = i < count ? '#f59e0b' : '#d1d5db'
    span.style.fontSize = '1rem'
    return span
  })
}

export function setFilterChipActive(btn: HTMLButtonElement, active: boolean): void {
  btn.style.background = active ? '#23282a' : ''
  btn.style.color = active ? '#fff' : ''
  btn.style.borderColor = active ? '#23282a' : ''
}

function showReviewModal(
  review: Review,
  cardLikeBtn: HTMLButtonElement,
  cardDislikeBtn: HTMLButtonElement
): void {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px'

  const modal = document.createElement('div')
  modal.style.cssText = 'background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden'

  // ── Fixed header ─────────────────────────────────────────────────────────
  const fixedHeader = document.createElement('div')
  fixedHeader.style.cssText = 'flex-shrink:0;padding:18px 20px 12px;border-bottom:1px solid #f3f4f6'

  // Row 1: avatar + username/type + stars + close
  const row1 = document.createElement('div')
  row1.style.cssText = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:12px'

  const img = document.createElement('img')
  img.src = gravatarUrl(review.email_hash, 36)
  img.alt = ''
  img.width = 36
  img.height = 36
  img.style.cssText = 'border-radius:50%;flex-shrink:0'

  const userMeta = document.createElement('div')
  userMeta.style.cssText = 'flex:1;min-width:0'
  const usernameEl = document.createElement('div')
  usernameEl.style.cssText = 'font-weight:700;font-size:0.95rem;color:#23282a'
  usernameEl.textContent = review.username
  const colors = TYPE_COLORS[review.type] ?? TYPE_COLORS.other
  const typeBadge = document.createElement('span')
  typeBadge.style.cssText = `display:inline-block;background:${colors.bg};color:${colors.fg};padding:1px 7px;border-radius:10px;font-size:0.75rem;text-transform:capitalize;margin-top:3px`
  typeBadge.textContent = review.type
  userMeta.appendChild(usernameEl)
  userMeta.appendChild(typeBadge)

  const rightCol = document.createElement('div')
  rightCol.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0'
  const starsDiv = document.createElement('div')
  buildStarSpans(review.stars).forEach(s => starsDiv.appendChild(s))
  const closeBtn = document.createElement('button')
  closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:1.25rem;padding:0;line-height:1;color:#6b7280'
  closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', () => overlay.remove())
  rightCol.appendChild(starsDiv)
  rightCol.appendChild(closeBtn)

  row1.appendChild(img)
  row1.appendChild(userMeta)
  row1.appendChild(rightCol)

  // Row 2: vote buttons + translate
  const row2 = document.createElement('div')
  row2.style.cssText = 'display:flex;align-items:center;gap:6px'

  const modalLikeBtn = document.createElement('button')
  modalLikeBtn.className = 'core-chip-button core-chip-button--flat core-chip-button--x-small'
  modalLikeBtn.dataset['value'] = '1'
  modalLikeBtn.textContent = cardLikeBtn.textContent
  setVoteButtonStyle(modalLikeBtn, cardLikeBtn.style.backgroundColor !== '')

  const modalDislikeBtn = document.createElement('button')
  modalDislikeBtn.className = 'core-chip-button core-chip-button--flat core-chip-button--x-small'
  modalDislikeBtn.dataset['value'] = '-1'
  modalDislikeBtn.textContent = cardDislikeBtn.textContent
  setVoteButtonStyle(modalDislikeBtn, cardDislikeBtn.style.backgroundColor !== '')

  modalLikeBtn.addEventListener('click', () => {
    cardLikeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    modalLikeBtn.textContent = cardLikeBtn.textContent
    modalDislikeBtn.textContent = cardDislikeBtn.textContent
    setVoteButtonStyle(modalLikeBtn, cardLikeBtn.style.backgroundColor !== '')
    setVoteButtonStyle(modalDislikeBtn, cardDislikeBtn.style.backgroundColor !== '')
  })
  modalDislikeBtn.addEventListener('click', () => {
    cardDislikeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    modalLikeBtn.textContent = cardLikeBtn.textContent
    modalDislikeBtn.textContent = cardDislikeBtn.textContent
    setVoteButtonStyle(modalLikeBtn, cardLikeBtn.style.backgroundColor !== '')
    setVoteButtonStyle(modalDislikeBtn, cardDislikeBtn.style.backgroundColor !== '')
  })

  const modalTranslateBtn = document.createElement('button')
  modalTranslateBtn.style.cssText = 'background:none;border:none;padding:0;color:#6b7280;font-size:0.75rem;cursor:pointer;margin-left:auto;white-space:nowrap'
  modalTranslateBtn.textContent = '🌐 ' + t('translate')

  let modalTranslated = false
  let modalTranslatedText: string | null = null
  const targetLang = navigator.language.split('-')[0]

  modalTranslateBtn.addEventListener('click', async () => {
    if (modalTranslated) {
      bodyEl.textContent = review.body
      modalTranslateBtn.textContent = '🌐 ' + t('translate')
      modalTranslated = false
      return
    }
    modalTranslateBtn.disabled = true
    modalTranslateBtn.textContent = t('translating')
    try {
      if (!modalTranslatedText) modalTranslatedText = await translateText(review.body, targetLang)
      bodyEl.textContent = modalTranslatedText
      modalTranslateBtn.textContent = t('showOriginal')
      modalTranslated = true
    } catch {
      modalTranslateBtn.textContent = '🌐 ' + t('translate')
    }
    modalTranslateBtn.disabled = false
  })

  row2.appendChild(modalLikeBtn)
  row2.appendChild(modalDislikeBtn)
  row2.appendChild(modalTranslateBtn)

  fixedHeader.appendChild(row1)
  fixedHeader.appendChild(row2)
  modal.appendChild(fixedHeader)

  // ── Scrollable body ───────────────────────────────────────────────────────
  const bodyEl = document.createElement('p')
  bodyEl.style.cssText = 'flex:1;overflow-y:auto;margin:0;padding:16px 20px;color:#374151;font-size:0.9rem;line-height:1.65;white-space:pre-wrap;word-break:break-word'
  bodyEl.textContent = review.body
  modal.appendChild(bodyEl)

  overlay.appendChild(modal)
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)
}

export function setVoteButtonStyle(btn: HTMLButtonElement, active: boolean): void {
  const isLike = btn.dataset['value'] === '1'
  btn.style.backgroundColor = active ? (isLike ? '#dcfce7' : '#fee2e2') : ''
  btn.style.color = active ? (isLike ? '#15803d' : '#dc2626') : ''
  btn.style.borderColor = active ? (isLike ? '#86efac' : '#fca5a5') : ''
  btn.style.fontWeight = active ? '600' : ''
}

export function renderReviewCard(review: Review, currentUserId?: string): HTMLElement {
  const card = document.createElement('div')
  card.dataset['mcReview'] = '1'
  card.dataset['type'] = review.type
  card.dataset['userVote'] = review.user_vote !== null ? String(review.user_vote) : ''
  card.dataset['reviewId'] = review.id
  card.dataset['stars'] = String(review.stars)
  // Fixed width for carousel; flex-shrink:0 prevents compression
  card.style.cssText = 'background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;flex:0 0 280px;min-width:0;display:flex;flex-direction:column;gap:10px'

  const viewDiv = document.createElement('div')
  viewDiv.id = `mc-view-${review.id}`
  viewDiv.style.cssText = 'display:flex;flex-direction:column;gap:10px;flex:1'

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:8px'

  const img = document.createElement('img')
  img.src = gravatarUrl(review.email_hash, 36)
  img.alt = ''
  img.width = 36
  img.height = 36
  img.style.cssText = 'border-radius:50%;flex-shrink:0'

  const meta = document.createElement('div')
  meta.style.cssText = 'flex:1;min-width:0;overflow:hidden'

  const usernameSpan = document.createElement('div')
  usernameSpan.style.cssText = 'font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
  usernameSpan.textContent = review.username

  const typeBadge = document.createElement('span')
  typeBadge.id = `mc-type-${review.id}`
  const colors = TYPE_COLORS[review.type] ?? TYPE_COLORS.other
  typeBadge.style.cssText = `display:inline-block;background:${colors.bg};color:${colors.fg};padding:1px 7px;border-radius:10px;font-size:0.7rem;text-transform:capitalize;margin-top:2px`
  typeBadge.textContent = review.type

  meta.appendChild(usernameSpan)
  meta.appendChild(typeBadge)

  const starsDiv = document.createElement('div')
  starsDiv.id = `mc-stars-${review.id}`
  starsDiv.style.cssText = 'white-space:nowrap;flex-shrink:0'
  buildStarSpans(review.stars).forEach(s => starsDiv.appendChild(s))

  header.appendChild(img)
  header.appendChild(meta)
  header.appendChild(starsDiv)

  if (currentUserId && currentUserId === review.user_id) {
    const ownBtns = document.createElement('div')
    ownBtns.style.cssText = 'display:flex;gap:2px;flex-shrink:0'

    const editBtn = document.createElement('button')
    editBtn.className = 'mc-edit-btn'
    editBtn.title = t('editTitle')
    editBtn.textContent = '✏️'
    editBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:2px;border-radius:4px;opacity:0.5;flex-shrink:0'

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'mc-delete-btn'
    deleteBtn.title = t('deleteTitle')
    deleteBtn.textContent = '🗑️'
    deleteBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:2px;border-radius:4px;opacity:0.5;flex-shrink:0'

    ownBtns.appendChild(editBtn)
    ownBtns.appendChild(deleteBtn)
    header.appendChild(ownBtns)
  }

  viewDiv.appendChild(header)

  // ── Vote buttons (created early so viewMoreBtn closure can reference them)
  const likeBtn = document.createElement('button')
  likeBtn.className = 'core-chip-button core-chip-button--flat core-chip-button--x-small mc-vote-btn'
  likeBtn.dataset['reviewId'] = review.id
  likeBtn.dataset['value'] = '1'
  likeBtn.textContent = `👍 ${review.likes}`
  setVoteButtonStyle(likeBtn, review.user_vote === 1)

  const dislikeBtn = document.createElement('button')
  dislikeBtn.className = 'core-chip-button core-chip-button--flat core-chip-button--x-small mc-vote-btn'
  dislikeBtn.dataset['reviewId'] = review.id
  dislikeBtn.dataset['value'] = '-1'
  dislikeBtn.textContent = `👎 ${review.dislikes}`
  setVoteButtonStyle(dislikeBtn, review.user_vote === -1)

  // ── Body ────────────────────────────────────────────────────────────────
  const body = document.createElement('p')
  body.id = `mc-body-${review.id}`
  body.style.cssText = 'margin:0;color:#374151;font-size:0.875rem;line-height:1.5;word-break:break-word;flex:1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical'
  body.textContent = review.body
  viewDiv.appendChild(body)

  if (review.body.length > 150) {
    const viewMoreBtn = document.createElement('button')
    viewMoreBtn.style.cssText = 'background:none;border:none;padding:0;color:#2563eb;font-size:0.8rem;cursor:pointer;text-decoration:underline;font-weight:normal;align-self:flex-end;text-transform:none!important'
    viewMoreBtn.textContent = t('viewMore')
    viewMoreBtn.addEventListener('click', () => showReviewModal(review, likeBtn, dislikeBtn))
    viewDiv.appendChild(viewMoreBtn)
  }

  const translateBtn = document.createElement('button')
  translateBtn.style.cssText = 'background:none;border:none;padding:0;color:#6b7280;font-size:0.75rem;cursor:pointer;margin-left:auto;white-space:nowrap;flex-shrink:0'
  translateBtn.textContent = '🌐 ' + t('translate')

  let translated = false
  let translatedText: string | null = null
  const targetLang = navigator.language.split('-')[0]

  translateBtn.addEventListener('click', async () => {
    if (translated) {
      body.textContent = review.body
      translateBtn.textContent = '🌐 ' + t('translate')
      translated = false
      return
    }
    translateBtn.disabled = true
    translateBtn.textContent = t('translating')
    try {
      if (!translatedText) translatedText = await translateText(review.body, targetLang)
      body.textContent = translatedText
      translateBtn.textContent = t('showOriginal')
      translated = true
    } catch {
      translateBtn.textContent = '🌐 ' + t('translate')
    }
    translateBtn.disabled = false
  })

  const votes = document.createElement('div')
  votes.style.cssText = 'display:flex;gap:6px;margin-top:auto'
  votes.appendChild(likeBtn)
  votes.appendChild(dislikeBtn)
  votes.appendChild(translateBtn)
  viewDiv.appendChild(votes)

  card.appendChild(viewDiv)
  return card
}


export function applyFilter(type: ReviewType | 'all'): void {
  document.querySelectorAll<HTMLElement>('[data-mc-review]').forEach(card => {
    const match = type === 'all' || card.dataset['type'] === type
    card.style.display = match ? '' : 'none'
  })
}

function makeArrowButton(dir: 'left' | 'right'): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = `mc-carousel-arrow mc-arrow-${dir}`
  btn.style.cssText = [
    'position:absolute',
    dir === 'left' ? 'left:-14px' : 'right:-14px',
    'top:50%',
    'transform:translateY(-50%)',
    'z-index:2',
    'width:36px',
    'height:36px',
    'border-radius:50%',
    'background:#fff',
    'border:1px solid #e5e7eb',
    'box-shadow:rgba(35,40,42,.12) 0 1px 4px 0',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'color:#374151',
    'transition:opacity .15s,transform .1s',
  ].join(';')
  btn.innerHTML = dir === 'left'
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L6 8L10 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3L10 8L6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return btn
}

export function buildReviewsSection(
  reviews: Review[],
  authenticated: boolean,
  currentUserId?: string,
  username?: string | null,
  onSignOut?: () => void,
  position: 'top' | 'bottom' = 'top',
  onTogglePosition?: () => void
): HTMLElement {
  // Inject webkit scrollbar hide once
  if (!document.getElementById('mc-styles')) {
    const style = document.createElement('style')
    style.id = 'mc-styles'
    style.textContent = '#mc-reviews-content::-webkit-scrollbar{display:none}@keyframes mc-fade-in{from{opacity:0}to{opacity:1}}'
    document.head.appendChild(style)
  }

  const section = document.createElement('section')
  section.id = 'mixers-club-reviews'
  // Exact match of Cookidoo's recipe-content__section computed styles
  section.style.cssText = [
    'background:#fff',
    'border-radius:16px',
    'box-shadow:rgba(35,40,42,.08) 0px 1px 3px 1px',
    'padding:16px 24px 24px',
    'max-width:1200px',
    'margin:24px auto 24px',
    'box-sizing:border-box',
  ].join(';')

  // Title row: heading left, account info right
  const titleRow = document.createElement('div')
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px'

  const h3 = document.createElement('h3')
  h3.style.cssText = 'margin:0;font-size:1rem;font-weight:700;color:#23282a'
  h3.textContent = t('reviewsTitle')
  titleRow.appendChild(h3)

  const rightGroup = document.createElement('div')
  rightGroup.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0'

  if (authenticated && username) {
    const accountEl = document.createElement('div')
    accountEl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.8rem;color:#6b7280;white-space:nowrap'

    const usernameEl = document.createElement('strong')
    usernameEl.style.color = '#23282a'
    usernameEl.textContent = username

    const sep = document.createElement('span')
    sep.textContent = '·'

    const signOutBtn = document.createElement('button')
    signOutBtn.id = 'mc-sign-out'
    signOutBtn.style.cssText = 'background:none;border:none;padding:0;color:#6b7280;font-size:0.8rem;cursor:pointer;text-decoration:underline;text-transform:none!important'
    signOutBtn.textContent = t('signOut')
    signOutBtn.addEventListener('click', () => onSignOut?.())

    accountEl.appendChild(usernameEl)
    accountEl.appendChild(sep)
    accountEl.appendChild(signOutBtn)
    rightGroup.appendChild(accountEl)
  }

  const posBtn = document.createElement('button')
  posBtn.id = 'mc-position-toggle'
  posBtn.title = position === 'top' ? t('moveToBottom') : t('moveToTop')
  posBtn.textContent = position === 'top' ? '↓' : '↑'
  posBtn.style.cssText = 'background:none;border:none;padding:0;color:#6b7280;font-size:1rem;cursor:pointer;line-height:1;flex-shrink:0'
  posBtn.addEventListener('click', () => onTogglePosition?.())
  rightGroup.appendChild(posBtn)

  titleRow.appendChild(rightGroup)
  section.appendChild(titleRow)

  // Filter chips
  const chipsDiv = document.createElement('div')
  chipsDiv.id = 'mc-filter-chips'
  chipsDiv.style.cssText = 'margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap'
  const chipLabels: Record<string, string> = {
    all: t('filterAll'),
    improvement: t('typeImprovement'), variation: t('typeVariation'),
    comment: t('typeComment'), warning: t('typeWarning'), other: t('typeOther'),
  }
  ;(['all', ...REVIEW_TYPES] as const).forEach((type, i) => {
    const btn = document.createElement('button')
    btn.className = 'core-chip-button core-chip-button--flat core-chip-button--x-small'
    btn.dataset['mcFilter'] = type
    btn.textContent = chipLabels[type]
    setFilterChipActive(btn, i === 0)
    chipsDiv.appendChild(btn)
  })
  section.appendChild(chipsDiv)

  // Carousel wrapper (position:relative so arrows can be absolute)
  const carouselWrapper = document.createElement('div')
  carouselWrapper.style.cssText = 'position:relative;padding:0 20px'

  // Scroll container
  const content = document.createElement('div')
  content.id = 'mc-reviews-content'
  content.style.cssText = [
    'display:flex',
    'gap:12px',
    'overflow-x:auto',
    'scroll-behavior:smooth',
    'padding:6px 2px',
    'scrollbar-width:none',
    '-ms-overflow-style:none',
  ].join(';')

  if (reviews.length === 0) {
    const empty = document.createElement('p')
    empty.style.cssText = 'color:#9ca3af;font-style:italic;padding:8px 0;margin:0'
    empty.textContent = t('noReviews')
    content.appendChild(empty)
  } else {
    reviews.forEach(r => content.appendChild(renderReviewCard(r, currentUserId)))
  }

  // Arrow buttons
  const leftArrow = makeArrowButton('left')
  const rightArrow = makeArrowButton('right')

  const SCROLL_STEP = 300
  leftArrow.addEventListener('click', () => content.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' }))
  rightArrow.addEventListener('click', () => content.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' }))

  const updateArrows = () => {
    const atStart = content.scrollLeft <= 2
    const atEnd = content.scrollLeft + content.clientWidth >= content.scrollWidth - 2
    leftArrow.style.opacity = atStart ? '0.3' : '1'
    leftArrow.style.pointerEvents = atStart ? 'none' : 'auto'
    rightArrow.style.opacity = atEnd ? '0.3' : '1'
    rightArrow.style.pointerEvents = atEnd ? 'none' : 'auto'
  }
  content.addEventListener('scroll', updateArrows, { passive: true })
  // Delay to allow DOM paint before measuring
  setTimeout(updateArrows, 50)

  carouselWrapper.appendChild(leftArrow)
  carouselWrapper.appendChild(content)
  carouselWrapper.appendChild(rightArrow)
  section.appendChild(carouselWrapper)

  // Action button
  const actionBtn = document.createElement('button')
  actionBtn.className = 'button--primary'
  actionBtn.style.marginTop = '14px'
  if (authenticated) {
    actionBtn.id = 'mc-add-review'
    actionBtn.textContent = t('addReview')
  } else {
    actionBtn.id = 'mc-login-to-review'
    actionBtn.textContent = t('loginToReview')
  }
  section.appendChild(actionBtn)

  // Filter chip interaction
  chipsDiv.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-mc-filter]')
    if (!btn) return
    chipsDiv.querySelectorAll<HTMLButtonElement>('[data-mc-filter]').forEach(b => setFilterChipActive(b, false))
    setFilterChipActive(btn, true)
    applyFilter(btn.dataset['mcFilter'] as ReviewType | 'all')
    setTimeout(updateArrows, 50)
  })

  return section
}
