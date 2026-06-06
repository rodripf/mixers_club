import type { TrendingRecipe } from '../../types'
import { t } from '../../i18n'

function getLocaleFromPath(): string {
  const match = window.location.pathname.match(/\/foundation\/([^/]+)/)
  return match?.[1] ?? 'en-GB'
}

function makeArrowBtn(dir: 'left' | 'right'): HTMLButtonElement {
  const btn = document.createElement('button')
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
  ].join(';')
  btn.innerHTML = dir === 'left'
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L6 8L10 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3L10 8L6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return btn
}

function buildRecipeTile(recipe: TrendingRecipe, locale: string): HTMLElement {
  const article = document.createElement('article')
  article.style.cssText = 'flex:0 0 240px;border-radius:4px;cursor:pointer'
  article.dataset['cookidooId'] = recipe.cookidoo_id

  const link = document.createElement('a')
  link.href = `/recipes/recipe/${locale}/${recipe.cookidoo_id}`
  link.style.cssText = 'text-decoration:none;color:inherit;display:block'

  // Image — same aspect ratio as Cookidoo core-tile (288×243 ≈ 6/5.06, use 240/203)
  const imgBox = document.createElement('div')
  imgBox.className = 'mc-tile-img'
  imgBox.style.cssText = 'width:100%;aspect-ratio:240/203;border-radius:4px;overflow:hidden;background:#f3f4f6'

  const img = document.createElement('img')
  img.src = recipe.image_url ?? ''
  img.alt = recipe.name ?? ''
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
  img.onerror = () => { img.style.display = 'none' }
  imgBox.appendChild(img)
  link.appendChild(imgBox)

  // Description — mirrors core-tile__description-wrapper
  const info = document.createElement('div')
  info.style.cssText = 'margin:8px 0 0;padding:0'

  const nameEl = document.createElement('p')
  nameEl.style.cssText = 'margin:0 0 4px;font-size:16px;font-weight:400;color:rgb(63,68,71);line-height:26px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical'
  nameEl.textContent = recipe.name ?? recipe.cookidoo_id

  // Rating row: "4.7 ★  💬 5"
  // avg_stars is our fallback; official Cookidoo rating is patched in after DOM settles
  const ratingRow = document.createElement('div')
  ratingRow.className = 'mc-tile-rating'
  ratingRow.style.cssText = 'display:flex;align-items:center;gap:4px'

  const counterEl = document.createElement('span')
  counterEl.className = 'mc-tile-counter'
  counterEl.style.cssText = 'font-size:14px;color:rgb(35,40,42)'
  counterEl.textContent = recipe.avg_stars.toFixed(1)

  const starEl = document.createElement('span')
  starEl.style.cssText = 'font-size:14px;color:#f59e0b'
  starEl.textContent = '★'

  const sepEl = document.createElement('span')
  sepEl.style.cssText = 'font-size:14px;color:rgb(200,200,200)'
  sepEl.textContent = '·'

  const commentEl = document.createElement('span')
  commentEl.style.cssText = 'font-size:14px;color:rgb(112,115,117)'
  commentEl.textContent = `💬 ${recipe.review_count}`

  ratingRow.appendChild(counterEl)
  ratingRow.appendChild(starEl)
  ratingRow.appendChild(sepEl)
  ratingRow.appendChild(commentEl)
  info.appendChild(nameEl)
  info.appendChild(ratingRow)
  link.appendChild(info)
  article.appendChild(link)
  return article
}


export function buildTrendingSection(recipes: TrendingRecipe[]): HTMLElement {
  if (!document.getElementById('mc-trending-styles')) {
    const style = document.createElement('style')
    style.id = 'mc-trending-styles'
    style.textContent = [
      '#mc-trending-content::-webkit-scrollbar{display:none}',
      '#mixers-club-trending a{border:none!important;border-bottom:none!important}',
      '#mixers-club-trending .mc-tile-img{transition:filter .15s}',
      '#mixers-club-trending article:hover .mc-tile-img{filter:brightness(0.85)}',
    ].join('')
    document.head.appendChild(style)
  }

  const locale = getLocaleFromPath()

  const section = document.createElement('section')
  section.id = 'mixers-club-trending'
  section.className = 'wf-spacing-bottom'
  section.style.cssText = 'max-width:1200px;margin:0 auto'

  const header = document.createElement('h2')
  header.id = 'mc-trending-header'
  // Match Cookidoo's core-stripe__header style
  header.style.cssText = 'font-family:inherit;font-size:24px;font-weight:400;color:rgb(35,40,42);line-height:30px;margin:0 0 16px;padding:0'
  header.textContent = t('trendingTitle')
  section.appendChild(header)

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;padding:0 20px'

  const content = document.createElement('div')
  content.id = 'mc-trending-content'
  content.style.cssText = [
    'display:flex',
    'gap:16px',
    'overflow-x:auto',
    'scroll-behavior:smooth',
    'padding:4px 2px 12px',
    'scrollbar-width:none',
    '-ms-overflow-style:none',
  ].join(';')

  if (recipes.length === 0) {
    const msg = document.createElement('p')
    msg.style.cssText = 'color:#9ca3af;font-style:italic;padding:8px 0;margin:0'
    msg.textContent = t('noTrending')
    content.appendChild(msg)
  } else {
    recipes.forEach(r => content.appendChild(buildRecipeTile(r, locale)))
  }

  const leftArrow = makeArrowBtn('left')
  const rightArrow = makeArrowBtn('right')
  const STEP = 256 // 240px tile + 16px gap

  leftArrow.addEventListener('click', () => content.scrollBy({ left: -STEP, behavior: 'smooth' }))
  rightArrow.addEventListener('click', () => content.scrollBy({ left: STEP, behavior: 'smooth' }))

  const updateArrows = () => {
    const atStart = content.scrollLeft <= 2
    const atEnd = content.scrollLeft + content.clientWidth >= content.scrollWidth - 2
    leftArrow.style.opacity = atStart ? '0.3' : '1'
    leftArrow.style.pointerEvents = atStart ? 'none' : 'auto'
    rightArrow.style.opacity = atEnd ? '0.3' : '1'
    rightArrow.style.pointerEvents = atEnd ? 'none' : 'auto'
  }
  content.addEventListener('scroll', updateArrows, { passive: true })
  setTimeout(updateArrows, 50)

  wrapper.appendChild(leftArrow)
  wrapper.appendChild(content)
  wrapper.appendChild(rightArrow)
  section.appendChild(wrapper)

  return section
}
