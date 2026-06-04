import type { Message, Review, Session } from '../../types'
import { waitForElement } from '../dom-helpers'
import { buildReviewsSection, renderReviewCard } from './reviews-section'
import { buildReviewForm } from './review-form'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

export async function initRecipePage(cookidooId: string, domain: string): Promise<void> {
  try {
    const recipeCard = await waitForElement('recipe-details#main-content recipe-card')
    const recipeDetails = recipeCard.closest('recipe-details')!
    const recipeContent = recipeDetails.querySelector('recipe-content')
    const recipeName = document.querySelector<HTMLElement>('.recipe-card__name')?.textContent?.trim() ?? ''

    const [reviewsResult, sessionResult] = await Promise.all([
      send<Review[]>({ action: 'getReviews', cookidooId, domain }),
      send<Session>({ action: 'getSession' }),
    ])

    const reviews = reviewsResult.data ?? []
    const authenticated = !!sessionResult.data

    const section = buildReviewsSection(reviews, authenticated)
    recipeDetails.insertBefore(section, recipeContent)

    // Voting
    section.addEventListener('click', async (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.mc-vote-btn')
      if (!btn || !authenticated) return
      const reviewId = btn.dataset['reviewId']!
      const value = Number(btn.dataset['value']) as 1 | -1
      btn.disabled = true
      await send({ action: 'vote', reviewId, value })

      // Optimistic update
      const current = parseInt(btn.textContent ?? '0', 10)
      btn.textContent = (value === 1 ? '+' : '-') + (Math.abs(current) + 1)
    })

    // Review form toggle
    const addBtn = section.querySelector('#mc-add-review')
    const loginBtn = section.querySelector('#mc-login-to-review')

    if (loginBtn) {
      loginBtn.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openPopup' } as any))
    }

    if (addBtn && authenticated) {
      addBtn.addEventListener('click', () => {
        if (section.querySelector('#mc-review-form')) return // already open

        const form = buildReviewForm({
          cookidooId,
          domain,
          recipeName,
          onSubmit: async (payload) => {
            const result = await send<Review>({ action: 'addReview', ...payload })
            if (result.data) {
              const content = section.querySelector('#mc-reviews-content')!
              content.insertBefore(renderReviewCard(result.data), content.firstChild)
            }
            return result
          },
        })

        section.querySelector('core-stripe')!.insertBefore(
          form,
          section.querySelector('#mc-add-review')
        )
        addBtn.textContent = 'Cancel'
        addBtn.addEventListener('click', () => {
          form.remove()
          addBtn.textContent = 'Add your review'
        }, { once: true })
      })
    }
  } catch (err) {
    // waitForElement already logged to console.error — nothing more to do here
  }
}
