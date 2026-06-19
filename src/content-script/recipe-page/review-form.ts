import type { ReviewType } from '../../types'
import { buildStarInput, syncFromCookidoo } from './star-watcher'
import { t } from '../../i18n'
import { friendlyError } from '../error-map'

interface FormOptions {
  initial?: { type: ReviewType; stars: number; body: string }
  cookidooId?: string
  domain?: string
  recipeName?: string
  onCancel?: () => void
  onSubmit: (payload: {
    type: ReviewType
    stars: number
    body: string
    cookidooId?: string
    domain?: string
    recipeName?: string
  }) => Promise<{ data: unknown; error: string | null }>
}

const TYPES: ReviewType[] = ['improvement', 'variation', 'comment', 'warning', 'other']

function setChipActive(btn: HTMLButtonElement, active: boolean): void {
  btn.style.background = active ? '#23282a' : ''
  btn.style.color = active ? '#fff' : ''
  btn.style.borderColor = active ? '#23282a' : ''
}

export function buildReviewForm(opts: FormOptions): HTMLElement {
  const isEdit = !!opts.initial
  const container = document.createElement('div')
  container.id = 'mc-review-form'

  let selectedType: ReviewType | null = opts.initial?.type ?? null

  const title = document.createElement('h4')
  title.textContent = isEdit ? t('formTitleEdit') : t('formTitle')
  container.appendChild(title)

  // Type selector
  const typeSelector = document.createElement('div')
  typeSelector.id = 'mc-type-selector'
  typeSelector.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px'

  const typeBtns: HTMLButtonElement[] = []
  const typeLabels: Record<string, string> = {
    improvement: t('typeImprovement'), variation: t('typeVariation'),
    comment: t('typeComment'), warning: t('typeWarning'), other: t('typeOther'),
  }
  TYPES.forEach(type => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'core-chip-button core-chip-button--flat core-chip-button--x-small'
    btn.dataset['mcType'] = type
    btn.textContent = typeLabels[type] ?? type
    setChipActive(btn, type === selectedType)
    btn.addEventListener('click', () => {
      selectedType = type
      typeBtns.forEach(b => setChipActive(b, false))
      setChipActive(btn, true)
    })
    typeBtns.push(btn)
    typeSelector.appendChild(btn)
  })
  container.appendChild(typeSelector)

  // Star input
  const starWrapper = document.createElement('div')
  starWrapper.id = 'mc-star-wrapper'
  starWrapper.style.margin = '12px 0'
  const starInput = buildStarInput(opts.initial?.stars ?? syncFromCookidoo()) as HTMLElement & { selectedRating: number | null }
  starWrapper.appendChild(starInput)
  container.appendChild(starWrapper)

  // Textarea
  const textarea = document.createElement('textarea')
  textarea.id = 'mc-body'
  textarea.rows = 4
  textarea.maxLength = 2000
  textarea.placeholder = t('formBodyPlaceholder')
  textarea.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;margin:8px 0 2px'
  if (opts.initial?.body) textarea.value = opts.initial.body
  container.appendChild(textarea)

  const counter = document.createElement('p')
  counter.style.cssText = 'margin:0 0 8px;font-size:0.75rem;color:#9ca3af;text-align:right'
  counter.textContent = `${textarea.value.length} / 2000`
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 2000`
  })
  container.appendChild(counter)

  // Error
  const errorEl = document.createElement('p')
  errorEl.id = 'mc-form-error'
  errorEl.style.cssText = 'color:red;display:none'
  container.appendChild(errorEl)

  // Buttons
  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px'

  const submitBtn = document.createElement('button')
  submitBtn.id = 'mc-submit'
  submitBtn.type = 'button'
  submitBtn.className = 'button--primary'
  submitBtn.textContent = isEdit ? t('formSave') : t('formSubmit')

  const cancelBtn = document.createElement('button')
  cancelBtn.id = 'mc-cancel'
  cancelBtn.type = 'button'
  cancelBtn.className = 'button--primary'
  cancelBtn.textContent = t('formCancel')
  cancelBtn.addEventListener('click', () => opts.onCancel?.())

  btnRow.appendChild(submitBtn)
  btnRow.appendChild(cancelBtn)
  container.appendChild(btnRow)

  submitBtn.addEventListener('click', async () => {
    const body = textarea.value.trim()
    const stars = starInput.selectedRating

    if (!selectedType) { errorEl.textContent = t('formErrType'); errorEl.style.display = ''; return }
    if (!stars) { errorEl.style.display = 'none'; starInput.style.outline = '2px solid red'; return }
    if (!body) { errorEl.textContent = t('formErrBody'); errorEl.style.display = ''; return }

    errorEl.style.display = 'none'
    starInput.style.outline = ''
    submitBtn.disabled = true
    submitBtn.textContent = isEdit ? t('formSaving') : t('formSubmitting')

    const result = await opts.onSubmit({
      type: selectedType, stars, body,
      cookidooId: opts.cookidooId, domain: opts.domain, recipeName: opts.recipeName,
    })

    if (result.error) {
      errorEl.textContent = friendlyError(result.error ?? '')
      errorEl.style.display = ''
      submitBtn.disabled = false
      submitBtn.textContent = isEdit ? t('formSave') : t('formSubmit')
    } else if (isEdit) {
      opts.onCancel?.()
    } else {
      const successEl = document.createElement('p'); successEl.textContent = t('formSuccess'); container.replaceChildren(successEl)
      setTimeout(() => opts.onCancel?.(), 1500)
    }
  })

  return container
}
