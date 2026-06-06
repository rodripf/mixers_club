import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildReviewForm } from '../../../src/content-script/recipe-page/review-form'

describe('buildReviewForm (add mode)', () => {
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

  it('shows "Submit" button (not "Save") in add mode', () => {
    const form = buildReviewForm({ cookidooId: 'r1', domain: 'cookidoo.co.uk', recipeName: 'Test', onSubmit: vi.fn() })
    expect(form.querySelector<HTMLButtonElement>('#mc-submit')?.textContent).toBe('Submit')
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

describe('buildReviewForm (edit mode)', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('shows "Save" button and "Edit Review" title', () => {
    const form = buildReviewForm({
      initial: { type: 'comment', stars: 3, body: 'Old text' },
      onSubmit: vi.fn(),
    })
    expect(form.querySelector<HTMLButtonElement>('#mc-submit')?.textContent).toBe('Save')
    expect(form.querySelector('h4')?.textContent).toBe('Edit Review')
  })

  it('pre-fills textarea with initial body', () => {
    const form = buildReviewForm({
      initial: { type: 'comment', stars: 3, body: 'My review' },
      onSubmit: vi.fn(),
    })
    expect((form.querySelector<HTMLTextAreaElement>('#mc-body'))?.value).toBe('My review')
  })

  it('pre-selects the initial type chip with active styles', () => {
    const form = buildReviewForm({
      initial: { type: 'warning', stars: 2, body: 'text' },
      onSubmit: vi.fn(),
    })
    const warningBtn = form.querySelector<HTMLButtonElement>('[data-mc-type="warning"]')!
    expect(warningBtn.style.background).toBe('rgb(35, 40, 42)')
  })

  it('calls onCancel when Cancel is clicked', () => {
    let called = false
    const form = buildReviewForm({
      initial: { type: 'comment', stars: 3, body: 'text' },
      onCancel: () => { called = true },
      onSubmit: vi.fn(),
    })
    const cancelBtn = form.querySelector<HTMLButtonElement>('#mc-cancel')!
    cancelBtn.click()
    expect(called).toBe(true)
  })
})
