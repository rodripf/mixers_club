import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildStarInput, syncFromCookidoo } from '../../../src/content-script/recipe-page/star-watcher'

describe('buildStarInput', () => {
  it('renders 5 star spans with data-value attributes', () => {
    const el = buildStarInput(null)
    const spans = el.querySelectorAll('.core-rating__point')
    expect(spans.length).toBe(5)
    spans.forEach((s, i) => {
      expect((s as HTMLElement).dataset['value']).toBe(String(i + 1))
    })
  })

  it('pre-fills stars when an existing rating is provided', () => {
    const el = buildStarInput(3)
    const full = el.querySelectorAll('.core-rating__point--full')
    expect(full.length).toBe(3)
  })

  it('shows no filled stars when rating is null', () => {
    const el = buildStarInput(null)
    const full = el.querySelectorAll('.core-rating__point--full')
    expect(full.length).toBe(0)
  })
})

describe('syncFromCookidoo', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('reads the data-rating attribute from core-rating when present', () => {
    document.body.innerHTML = '<core-rating data-rating="4"></core-rating>'
    const rating = syncFromCookidoo()
    expect(rating).toBe(4)
  })

  it('returns null when core-rating has no data-rating', () => {
    document.body.innerHTML = '<core-rating></core-rating>'
    const rating = syncFromCookidoo()
    expect(rating).toBeNull()
  })

  it('returns null when core-rating is absent', () => {
    expect(syncFromCookidoo()).toBeNull()
  })
})
