import type { Message, PublicSession, Review, ReviewType } from '../../types'
import { waitForElement } from '../dom-helpers'
import { buildReviewsSection, renderReviewCard, setVoteButtonStyle } from './reviews-section'
import { buildReviewForm } from './review-form'
import { showAuthModal } from '../auth-modal'
import { t } from '../../i18n'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]!) : null
}

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${365 * 86400};path=/;SameSite=Lax`
}

export async function initRecipePage(cookidooId: string, domain: string): Promise<void> {
  try {
    const recipeCard = await waitForElement('recipe-details#main-content recipe-card')
    const recipeDetails = recipeCard.closest('recipe-details')!
    const recipeContent = recipeDetails.querySelector('recipe-content')
    const recipeName = document.querySelector<HTMLElement>('.recipe-card__name')?.textContent?.trim() ?? ''
    const recipeImageUrl = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? null

    const [reviewsResult, sessionResult] = await Promise.all([
      send<Review[]>({ action: 'getReviews', cookidooId }),
      send<PublicSession>({ action: 'getSession' }),
    ])

    const reviews = reviewsResult.data ?? []
    const authenticated = !!sessionResult.data
    const currentUserId = sessionResult.data?.userId

    let position: 'top' | 'bottom' = getCookie('mc_reviews_pos') === 'bottom' ? 'bottom' : 'top'

    const insertSection = () => {
      if (position === 'bottom') {
        const altRecipes = document.querySelector('#alternative-recipes')
        const pageContent = recipeDetails.parentElement!
        pageContent.insertBefore(section, altRecipes)
      } else {
        recipeDetails.insertBefore(section, recipeContent)
      }
    }

    const onTogglePosition = () => {
      position = position === 'top' ? 'bottom' : 'top'
      setCookie('mc_reviews_pos', position)
      insertSection()
      const btn = section.querySelector<HTMLButtonElement>('#mc-position-toggle')
      if (btn) {
        btn.textContent = position === 'top' ? '↓' : '↑'
        btn.title = position === 'top' ? t('moveToBottom') : t('moveToTop')
      }
    }

    const section = buildReviewsSection(
      reviews, authenticated, currentUserId,
      sessionResult.data?.username,
      async () => { await send({ action: 'signOut' }); location.reload() },
      position,
      onTogglePosition
    )
    insertSection()

    // ── Voting ──────────────────────────────────────────────────────────────
    section.addEventListener('click', async (e) => {
      const target = e.target as Element

      const voteBtn = target.closest<HTMLButtonElement>('.mc-vote-btn')
      if (voteBtn && !authenticated) {
        const existing = voteBtn.parentElement?.querySelector('.mc-vote-hint')
        if (!existing) {
          const hint = document.createElement('span')
          hint.className = 'mc-vote-hint'
          hint.style.cssText = 'font-size:0.75rem;color:#6b7280;white-space:nowrap;animation:mc-fade-in .15s ease'
          hint.textContent = t('loginToReview')
          voteBtn.parentElement?.appendChild(hint)
          setTimeout(() => hint.remove(), 2500)
        }
        return
      }
      if (voteBtn && authenticated) {
        const card = voteBtn.closest<HTMLElement>('[data-mc-review]')!
        const reviewId = card.dataset['reviewId']!
        const clickedValue = Number(voteBtn.dataset['value']) as 1 | -1
        const rawVote = card.dataset['userVote']
        const currentVote = rawVote === '1' ? 1 : rawVote === '-1' ? -1 : null

        const likeBtn = card.querySelector<HTMLButtonElement>('.mc-vote-btn[data-value="1"]')!
        const dislikeBtn = card.querySelector<HTMLButtonElement>('.mc-vote-btn[data-value="-1"]')!

        let likes = parseInt(likeBtn.textContent?.replace(/\D/g, '') ?? '0', 10)
        let dislikes = parseInt(dislikeBtn.textContent?.replace(/\D/g, '') ?? '0', 10)

        let newVote: 1 | -1 | 0
        if (currentVote === clickedValue) {
          // toggle off
          newVote = 0
          if (clickedValue === 1) likes = Math.max(0, likes - 1)
          else dislikes = Math.max(0, dislikes - 1)
        } else {
          // remove old vote, add new
          if (currentVote === 1) likes = Math.max(0, likes - 1)
          if (currentVote === -1) dislikes = Math.max(0, dislikes - 1)
          newVote = clickedValue
          if (clickedValue === 1) likes++
          else dislikes++
        }

        card.dataset['userVote'] = newVote === 0 ? '' : String(newVote)
        likeBtn.textContent = `👍 ${likes}`
        dislikeBtn.textContent = `👎 ${dislikes}`
        setVoteButtonStyle(likeBtn, newVote === 1)
        setVoteButtonStyle(dislikeBtn, newVote === -1)

        await send({ action: 'vote', reviewId, value: newVote })
        return
      }

      // ── Edit button ───────────────────────────────────────────────────────
      const editBtn = target.closest<HTMLButtonElement>('.mc-edit-btn')
      if (editBtn && authenticated) {
        const card = editBtn.closest<HTMLElement>('[data-mc-review]')!
        const reviewId = card.dataset['reviewId']!
        if (section.querySelector('#mc-review-form')) return // form already open

        const currentType = card.dataset['type'] as ReviewType
        const currentStars = parseInt(card.dataset['stars'] ?? '0', 10)
        const currentBody = card.querySelector<HTMLElement>(`#mc-body-${reviewId}`)?.textContent ?? ''

        const form = buildReviewForm({
          initial: { type: currentType, stars: currentStars, body: currentBody },
          onCancel: () => { form.remove(); if (addBtn) addBtn.style.display = '' },
          onSubmit: async ({ type, stars, body }) => {
            const result = await send({ action: 'updateReview', reviewId, cookidooId, type: type!, stars: stars!, body: body! })
            if (!result.error) {
              card.dataset['type'] = type!
              card.dataset['stars'] = String(stars)

              const typeBadge = card.querySelector<HTMLElement>(`#mc-type-${reviewId}`)
              if (typeBadge) typeBadge.textContent = type!

              const starsDiv = card.querySelector<HTMLElement>(`#mc-stars-${reviewId}`)
              if (starsDiv) {
                starsDiv.replaceChildren()
                Array.from({ length: 5 }, (_, i) => {
                  const s = document.createElement('span')
                  s.textContent = '★'
                  s.style.color = i < stars! ? '#f59e0b' : '#d1d5db'
                  s.style.fontSize = '1rem'
                  starsDiv.appendChild(s)
                })
              }

              const bodyEl = card.querySelector<HTMLElement>(`#mc-body-${reviewId}`)
              if (bodyEl) bodyEl.textContent = body!
            }
            return { data: result.data, error: result.error }
          },
        })

        const anchor = section.querySelector<HTMLElement>('#mc-add-review, #mc-login-to-review')
        if (addBtn) addBtn.style.display = 'none'
        section.insertBefore(form, anchor)
        return
      }

      // ── Delete button ─────────────────────────────────────────────────────
      const deleteBtn = target.closest<HTMLButtonElement>('.mc-delete-btn')
      if (deleteBtn && authenticated) {
        const card = deleteBtn.closest<HTMLElement>('[data-mc-review]')!
        const reviewId = card.dataset['reviewId']!

        // Inline confirmation — replace delete btn with Yes/No
        const ownBtns = deleteBtn.parentElement!
        ownBtns.replaceChildren()

        const confirmMsg = document.createElement('span')
        confirmMsg.style.cssText = 'font-size:0.75rem;color:#374151'
        confirmMsg.textContent = t('deleteConfirm')

        const yesBtn = document.createElement('button')
        yesBtn.textContent = t('yes')
        yesBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.75rem;color:#dc2626;padding:0 4px;font-weight:600'

        const noBtn = document.createElement('button')
        noBtn.textContent = t('no')
        noBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.75rem;color:#6b7280;padding:0 4px'

        noBtn.addEventListener('click', () => {
          ownBtns.replaceChildren()
          ownBtns.appendChild(editBtn2)
          ownBtns.appendChild(deleteBtnRestored)
        })

        yesBtn.addEventListener('click', async () => {
          card.style.opacity = '0.5'
          yesBtn.disabled = true
          const result = await send({ action: 'deleteReview', reviewId, cookidooId })
          if (result.error) {
            card.style.opacity = ''
            yesBtn.disabled = false
          } else {
            card.remove()
          }
        })

        const editBtn2 = document.createElement('button')
        editBtn2.className = 'mc-edit-btn'
        editBtn2.title = 'Edit your review'
        editBtn2.textContent = '✏️'
        editBtn2.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:2px;border-radius:4px;opacity:0.5;flex-shrink:0'

        const deleteBtnRestored = document.createElement('button')
        deleteBtnRestored.className = 'mc-delete-btn'
        deleteBtnRestored.title = 'Delete your review'
        deleteBtnRestored.textContent = '🗑️'
        deleteBtnRestored.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.9rem;padding:2px;border-radius:4px;opacity:0.5;flex-shrink:0'

        ownBtns.appendChild(confirmMsg)
        ownBtns.appendChild(yesBtn)
        ownBtns.appendChild(noBtn)
        return
      }
    })

    // ── Add review form ───────────────────────────────────────────────────
    const addBtn = section.querySelector<HTMLButtonElement>('#mc-add-review')
    const loginBtn = section.querySelector('#mc-login-to-review')

    if (loginBtn) {
      loginBtn.addEventListener('click', () => showAuthModal(() => location.reload()))
    }

    if (addBtn && authenticated) {
      addBtn.addEventListener('click', () => {
        if (section.querySelector('#mc-review-form')) return

        addBtn.style.display = 'none'

        const form = buildReviewForm({
          cookidooId,
          domain,
          recipeName,
          onCancel: () => { form.remove(); addBtn.style.display = '' },
          onSubmit: async (payload) => {
            const result = await send<Review>({
              action: 'addReview',
              cookidooId: payload.cookidooId!,
              domain: payload.domain!,
              recipeName: payload.recipeName!,
              type: payload.type,
              stars: payload.stars,
              body: payload.body,
              imageUrl: recipeImageUrl,
            })
            if (result.data) {
              const content = section.querySelector('#mc-reviews-content')!
              content.insertBefore(renderReviewCard(result.data, currentUserId), content.firstChild)
            }
            return result
          },
        })

        section.insertBefore(form, addBtn)
      })
    }
  } catch {
    // waitForElement already logged to console.error
  }
}
