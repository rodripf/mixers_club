import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildReviewForm } from '../../../src/content-script/recipe-page/review-form'

describe('buildReviewForm', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('renders type selector with all 5 review types', () => {
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit: vi.fn() })
    const typeButtons = form.querySelectorAll('[data-mc-type]')
    expect(typeButtons.length).toBe(5)
    const types = Array.from(typeButtons).map(b => b.getAttribute('data-mc-type'))
    expect(types).toEqual(['improvement', 'variation', 'comment', 'warning', 'other'])
  })

  it('renders a textarea for the review body', () => {
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit: vi.fn() })
    expect(form.querySelector('textarea#mc-body')).toBeTruthy()
  })

  it('calls onSubmit with correct payload when form is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ data: {}, error: null })
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit })
    document.body.appendChild(form)

    // Select a type
    const typeBtn = form.querySelector<HTMLButtonElement>('[data-mc-type="comment"]')!
    typeBtn.click()

    // Set star rating via the star input element's mock
    const starInput = form.querySelector('#mc-star-input') as HTMLElement & { selectedRating: number }
    Object.defineProperty(starInput, 'selectedRating', { get: () => 4, configurable: true })

    // Fill body
    const textarea = form.querySelector<HTMLTextAreaElement>('#mc-body')!
    textarea.value = 'Loved this recipe'

    // Submit
    const submitBtn = form.querySelector<HTMLButtonElement>('#mc-submit')!
    submitBtn.click()
    await new Promise(r => setTimeout(r, 0))

    expect(onSubmit).toHaveBeenCalledWith({
      cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test',
      type: 'comment', stars: 4, body: 'Loved this recipe',
    })
  })
})
