import type { ReviewType } from '../../types'
import { buildStarInput, syncFromCookidoo } from './star-watcher'

interface FormOptions {
  cookidooId: string
  domain: string
  recipeName: string
  onSubmit: (payload: {
    cookidooId: string
    domain: string
    recipeName: string
    type: ReviewType
    stars: number
    body: string
  }) => Promise<{ data: unknown; error: string | null }>
}

const TYPES: ReviewType[] = ['improvement', 'variation', 'comment', 'warning', 'other']

export function buildReviewForm(opts: FormOptions): HTMLElement {
  const container = document.createElement('div')
  container.id = 'mc-review-form'

  let selectedType: ReviewType | null = null

  const typeButtons = TYPES.map(t =>
    `<button class="core-chip-button core-chip-button--flat core-chip-button--x-small" data-mc-type="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
  ).join('')

  container.innerHTML = `
    <h4>Your Review</h4>
    <div id="mc-type-selector">${typeButtons}</div>
    <div id="mc-star-wrapper" style="margin:12px 0"></div>
    <textarea id="mc-body" rows="4" placeholder="Share your experience…"
      style="width:100%;box-sizing:border-box;padding:8px;margin:8px 0"></textarea>
    <p id="mc-form-error" style="color:red;display:none"></p>
    <button id="mc-submit" class="button--primary">Submit</button>
  `

  // Type selector
  container.querySelector('#mc-type-selector')!.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-mc-type]')
    if (!btn) return
    container.querySelectorAll('[data-mc-type]').forEach(b => b.classList.remove('core-chip-button--active'))
    btn.classList.add('core-chip-button--active')
    selectedType = btn.dataset['mcType'] as ReviewType
  })

  // Star input
  const initialRating = syncFromCookidoo()
  const starInput = buildStarInput(initialRating) as HTMLElement & { selectedRating: number | null }
  container.querySelector('#mc-star-wrapper')!.appendChild(starInput)

  // Submit
  container.querySelector('#mc-submit')!.addEventListener('click', async () => {
    const errorEl = container.querySelector<HTMLElement>('#mc-form-error')!
    const body = (container.querySelector<HTMLTextAreaElement>('#mc-body')!).value.trim()
    const stars = starInput.selectedRating

    if (!selectedType) { errorEl.textContent = 'Please select a review type.'; errorEl.style.display = ''; return }
    if (!stars) { errorEl.style.display = 'none'; starInput.style.outline = '2px solid red'; return }
    if (!body) { errorEl.textContent = 'Please write something.'; errorEl.style.display = ''; return }

    errorEl.style.display = 'none'
    starInput.style.outline = ''
    const submitBtn = container.querySelector<HTMLButtonElement>('#mc-submit')!
    submitBtn.disabled = true
    submitBtn.textContent = 'Submitting…'

    const result = await opts.onSubmit({
      cookidooId: opts.cookidooId, domain: opts.domain, recipeName: opts.recipeName,
      type: selectedType, stars, body,
    })

    if (result.error) {
      errorEl.textContent = `Error: ${result.error}`
      errorEl.style.display = ''
      submitBtn.disabled = false
      submitBtn.textContent = 'Submit'
    } else {
      container.innerHTML = '<p>Review submitted! Thank you.</p>'
    }
  })

  return container
}
