// Reads the user's existing Cookidoo rating from the page.
// Cookidoo may store the user's personal vote in a data-rating attribute on
// the interactive core-rating element (authenticated page only).
// If the attribute is absent, returns null — the user hasn't rated yet.
export function syncFromCookidoo(): number | null {
  const ratingEl = document.querySelector('core-rating[data-rating]')
  const raw = ratingEl?.getAttribute('data-rating')
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

// Builds a clone of Cookidoo's core-rating structure for use inside our form.
// When a span is clicked, it updates the clone and attempts to click the real
// Cookidoo star (best-effort — Cookidoo's native UX fires if the real element exists).
export function buildStarInput(initialRating: number | null): HTMLElement & { selectedRating: number | null } {
  let currentRating = initialRating

  const el = document.createElement('core-rating') as HTMLElement & { selectedRating: number | null }
  el.id = 'mc-star-input'

  const list = document.createElement('div')
  list.className = 'core-rating__rating-list'

  for (let i = 1; i <= 5; i++) {
    const span = document.createElement('span')
    span.className = 'core-rating__point' + (initialRating && i <= initialRating ? ' core-rating__point--full' : '')
    span.dataset['value'] = String(i)
    span.style.cursor = 'pointer'
    span.addEventListener('click', () => {
      currentRating = i
      updateCloneDisplay(list, i)
      triggerCookidooStar(i)
    })
    list.appendChild(span)
  }

  el.appendChild(list)

  // Watch for Cookidoo's real rating element confirming a vote
  observeCookidooRating((confirmedRating) => {
    currentRating = confirmedRating
    updateCloneDisplay(list, confirmedRating)
  })

  // Expose current rating for the form to read
  Object.defineProperty(el, 'selectedRating', { get: () => currentRating })

  return el
}

function updateCloneDisplay(list: HTMLElement, rating: number): void {
  list.querySelectorAll<HTMLElement>('.core-rating__point').forEach((span, i) => {
    span.className = 'core-rating__point' + (i < rating ? ' core-rating__point--full' : '')
  })
}

function triggerCookidooStar(value: number): void {
  // Cookidoo's interactive rating inputs are radio-style buttons or spans.
  // Try common selectors; fail silently if they don't exist.
  const realStars = document.querySelectorAll<HTMLElement>(
    'core-rating:not(#mc-star-input) .core-rating__point, ' +
    'core-rating:not(#mc-star-input) input[type="radio"]'
  )
  const target = realStars[value - 1]
  if (target) target.click()
}

function observeCookidooRating(onConfirm: (rating: number) => void): void {
  const observer = new MutationObserver(() => {
    const confirmed = syncFromCookidoo()
    if (confirmed !== null) onConfirm(confirmed)
  })
  const ratingEl = document.querySelector('core-rating:not(#mc-star-input)')
  if (ratingEl) {
    observer.observe(ratingEl, { attributes: true, subtree: true, childList: true })
  }
}
