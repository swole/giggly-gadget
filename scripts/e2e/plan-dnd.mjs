// End-to-end check of drag and drop on /plan: real touch (CDP touch events at 390 px, Android
// Chrome emulation) and a real mouse (1280 px) in headless Chrome, against the dev server.
// 30 checks, about a minute. Added 2026-09-27 with the feature.
//
// The dev server reads and writes PRODUCTION data, so this plans on a sandbox week (a Monday
// ~10 weeks out, or WEEK=YYYY-MM-DD), refuses to touch a week that already has meals
// (FORCE_CLEAR=1 overrides, e.g. after a crashed run), and clears the week when it ends.
//
// Setup (puppeteer-core is not a dependency of the app):
//   npm i --no-save puppeteer-core@24
// Run, with `npm run dev` up (or the Browser pane's "giggly-gadget" server on :3010):
//   BASE=http://localhost:3010 node scripts/e2e/plan-dnd.mjs
// CHROME=<path to chrome.exe> if Chrome is not in the default Windows location.
// Screenshots land in OUT (default: <tmp>/plan-dnd-shots).
//
// Gotchas it encodes: input sent to a background tab hangs in headless Chrome (bringToFront
// first); the "● live" label is CSS-uppercased, so read textContent, not innerText; and
// auto-scroll keeps scrolling while the finger is near the edge, so aim at the row's live rect.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:3010'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.resolve(process.env.OUT ?? path.join(os.tmpdir(), 'plan-dnd-shots'))
const PROFILE = path.join(os.tmpdir(), 'plan-dnd-profile')
fs.mkdirSync(OUT, { recursive: true })
const WEEK = process.env.WEEK ?? (() => {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 70))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // back to Monday
  return d.toISOString().slice(0, 10)
})()
const COOKIE = 'gg_role=johnny'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`)
}
async function api(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', cookie: COOKIE }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, j: await res.json().catch(() => ({})) }
}
const shift = (ymd, n) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n)).toISOString().slice(0, 10)
const day = (n) => shift(WEEK, n)
/** "Mon 7 breakfast", as lib/plan/travel.ts mealLabel writes it. */
const lab = (n, slot) => `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][n]} ${Number(day(n).slice(8))} ${slot}`
const meals = async () => (await api('GET', `/api/plan/meals?week=${WEEK}`)).j.meals
async function waitMeal(id, pred, ms = 5000) {
  const t0 = Date.now()
  let m
  while (Date.now() - t0 < ms) {
    m = (await meals()).find((x) => x.id === id)
    if (m && pred(m)) return m
    await sleep(250)
  }
  return m
}
const where = (m) => (m ? `${m.planned_for} ${m.slot}` : 'missing')

// ---- three real recipes from recent weeks ----
const recipeIds = new Set()
{
  const now = new Date()
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  for (let w = 0; w < 10 && recipeIds.size < 3; w++) {
    const week = shift(monday.toISOString().slice(0, 10), -7 * w)
    for (const m of (await api('GET', `/api/plan/meals?week=${week}`)).j.meals ?? []) if (m.recipe_id && m.leftover_of === null) recipeIds.add(m.recipe_id)
  }
}
const [soupId, wrapId, melonId] = [...recipeIds]
if (!melonId) throw new Error('Need three recipes planned in the last ten weeks to seed the sandbox.')

// ---- seed the sandbox week ----
const existing = await meals()
if (existing.length > 0 && process.env.FORCE_CLEAR !== '1') {
  throw new Error(`Sandbox week ${WEEK} already has ${existing.length} meals. Pick another WEEK, or FORCE_CLEAR=1 if they are a crashed run's leftovers.`)
}
await api('POST', '/api/plan/clear', { week_of: WEEK })
const add = async (b) => (await api('POST', '/api/plan/meals', b)).j.meal
const soup = await add({ planned_for: day(0), slot: 'dinner', recipe_id: soupId })
const left = await add({ planned_for: day(1), slot: 'lunch', recipe_id: soupId, leftover_of: soup.id })
const wrapTue = await add({ planned_for: day(1), slot: 'breakfast', recipe_id: wrapId })
const wrapWed = await add({ planned_for: day(2), slot: 'breakfast', recipe_id: wrapId })
const melon = await add({ planned_for: day(1), slot: 'dinner', recipe_id: melonId })
const yogurt = await add({ planned_for: day(0), slot: 'breakfast', custom_text: 'Greek yogurt' })
console.log(`sandbox week ${WEEK} seeded`)

fs.rmSync(PROFILE, { recursive: true, force: true }) // fresh localStorage: the first-run tip shows
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 60000,
  userDataDir: PROFILE,
  args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars'],
})
const errors = []
try {
  async function openPage(mobile) {
    const page = await browser.newPage()
    if (mobile) {
      await page.emulate({
        viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      })
    } else {
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
    }
    await page.setCookie({ name: 'gg_role', value: 'johnny', domain: new URL(BASE).hostname, path: '/', httpOnly: true })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${mobile ? 'phone' : 'desk'}: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${mobile ? 'phone' : 'desk'} pageerror: ${e}`))
    await page.goto(`${BASE}/plan?week=${WEEK}`, { waitUntil: 'networkidle2', timeout: 180000 })
    await page.waitForSelector(`[data-meal="${soup.id}"]`, { timeout: 60000 })
    await page.waitForFunction(() => document.body.textContent.includes('● live'), { timeout: 30000 }).catch(() => errors.push('never went live'))
    return page
  }
  const chip = (id) => `[data-meal="${id}"]`
  const slot = (d, s) => `[data-slot="${d}:${s}"]`
  const rectOf = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } })
  async function scrollTo(page, sel, y) {
    await page.$eval(sel, (el, y) => window.scrollBy(0, el.getBoundingClientRect().top - y), y)
    await sleep(200)
  }
  const dragState = (page, id) => page.evaluate((id) => {
    const overlay = [...document.body.children].find((el) => el.style && el.style.zIndex === '70')
    const lit = document.querySelector('[data-slot][data-drop]')
    return {
      overlay: !!overlay && overlay.getBoundingClientRect().width > 0,
      caption: overlay?.querySelector('.bottom-full')?.textContent ?? null,
      lit: lit?.getAttribute('data-slot') ?? null,
      litValid: lit ? lit.getAttribute('data-drop') === 'ok' : null,
      ghost: !!document.querySelector(`[data-meal="${id}"].opacity-40`),
    }
  }, id)
  const toast = (page) => page.evaluate(() => [...document.querySelectorAll('[role=status]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' / '))

  async function touchDrag(page, id, toSel, { hold = 420, steps = 14, shot, offsetX = 90 } = {}) {
    const a = await rectOf(page, chip(id))
    const sx = a.x + offsetX, sy = a.cy // on the title link
    await page.touchscreen.touchStart(sx, sy)
    await sleep(hold)
    const b = await rectOf(page, toSel)
    const tx = b.x + b.w * 0.55, ty = b.cy
    for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(sx + ((tx - sx) * i) / steps, sy + ((ty - sy) * i) / steps); await sleep(16) }
    await sleep(300)
    const mid = await dragState(page, id)
    if (shot) await page.screenshot({ path: path.join(OUT, shot) })
    await page.touchscreen.touchEnd()
    await sleep(700)
    return mid
  }

  // ======================= PHONE =======================
  const phone = await openPage(true)
  await phone.screenshot({ path: path.join(OUT, '01-tip.png') })
  const tip = await phone.evaluate(() => document.body.innerText.includes('Press and hold a meal, then drag it to another day or mealtime.'))
  check('first-run tip mentions dragging', tip)
  await phone.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it')?.click())
  await sleep(300)

  // second page (desktop) open on the same week, to see realtime
  const desk = await openPage(false)
  await phone.bringToFront() // input to a background tab hangs in headless Chrome
  await sleep(300)

  // 1. touch move Tue breakfast -> Mon breakfast
  await scrollTo(phone, slot(day(0), 'breakfast'), 110)
  let mid = await touchDrag(phone, wrapTue.id, slot(day(0), 'breakfast'), { shot: '02-phone-dragging.png' })
  check('touch: long-press lifts the meal (overlay + ghost)', mid.overlay && mid.ghost, JSON.stringify(mid))
  check('touch: caption says where it lands', mid.caption === `Move to ${lab(0, 'breakfast')}`, mid.caption)
  check('touch: target row lit as valid', mid.lit === `${day(0)}:breakfast` && mid.litValid === true, `${mid.lit} valid=${mid.litValid}`)
  await phone.screenshot({ path: path.join(OUT, '03-phone-dropped.png') })
  let m = await waitMeal(wrapTue.id, (x) => x.planned_for === day(0) && x.slot === 'breakfast')
  check('touch: saved to Mon breakfast', m?.planned_for === day(0) && m?.slot === 'breakfast', where(m))
  check('touch: after the one-off already there', m?.position === 1, `position ${m?.position}`)
  let t = await toast(phone)
  check('touch: toast "Moved to ..." with Undo', t.includes(`Moved to ${lab(0, 'breakfast')}`) && /Undo/i.test(t), t)
  check('touch: no navigation on drop', phone.url().includes('/plan?week='), phone.url())
  let rt = false
  for (let i = 0; i < 20 && !rt; i++) { rt = await desk.$(`${slot(day(0), 'breakfast')} ${chip(wrapTue.id)}`).then(Boolean); if (!rt) await sleep(250) }
  check('realtime: second page shows the meal in its new row', rt)

  // 2. Undo
  await phone.evaluate(() => [...document.querySelectorAll('[role=status] button')].find((b) => /undo/i.test(b.textContent))?.click())
  m = await waitMeal(wrapTue.id, (x) => x.planned_for === day(1) && x.slot === 'breakfast')
  check('undo puts it back on Tue breakfast', m?.planned_for === day(1) && m?.slot === 'breakfast', where(m))

  // 3. leftovers before their meal: refused
  await sleep(400)
  await scrollTo(phone, slot(day(0), 'lunch'), 140)
  mid = await touchDrag(phone, left.id, slot(day(0), 'lunch'), { shot: '04-phone-refused.png' })
  check('refused: caption explains leftovers order', mid.caption === `Leftovers have to come after ${lab(0, 'dinner')}`, mid.caption)
  check('refused: target row marked refused', mid.lit === `${day(0)}:lunch` && mid.litValid === false, `${mid.lit} valid=${mid.litValid}`)
  t = await toast(phone)
  check('refused: toast repeats the reason', t.includes(`Leftovers have to come after ${lab(0, 'dinner')}`), t)
  m = (await meals()).find((x) => x.id === left.id)
  check('refused: leftovers not moved', m?.planned_for === day(1) && m?.slot === 'lunch', where(m))

  // 4. duplicate recipe: refused
  await scrollTo(phone, slot(day(1), 'breakfast'), 160)
  mid = await touchDrag(phone, wrapTue.id, slot(day(2), 'breakfast'))
  check('duplicate: caption', mid.caption === `${lab(2, 'breakfast')} already has it`, mid.caption)
  m = (await meals()).find((x) => x.id === wrapTue.id)
  check('duplicate: not moved', m?.planned_for === day(1), where(m))

  // 5. a meal past its own leftovers: refused
  await scrollTo(phone, slot(day(0), 'dinner'), 120)
  mid = await touchDrag(phone, soup.id, slot(day(1), 'dinner'), { shot: '07-phone-refused-long.png' })
  const capFits = await phone.evaluate(() => { const c = [...document.body.children].find((el) => el.style && el.style.zIndex === '70')?.querySelector('.bottom-full'); return c ? c.getBoundingClientRect().right <= innerWidth : true })
  check('source after leftovers: caption', mid.caption === `Its leftovers on ${lab(1, 'lunch')} would come first`, mid.caption)
  check('long caption stays on screen', capFits)
  m = (await meals()).find((x) => x.id === soup.id)
  check('source after leftovers: not moved', m?.planned_for === day(0) && m?.slot === 'dinner', where(m))

  // 6. a quick swipe that starts on a meal scrolls instead of dragging
  await sleep(300)
  await scrollTo(phone, chip(melon.id), 500)
  {
    const y0 = await phone.evaluate(() => window.scrollY)
    const a = await rectOf(phone, chip(melon.id))
    await phone.touchscreen.touchStart(a.x + 90, a.cy)
    let sawOverlay = false
    for (let i = 1; i <= 8; i++) { await phone.touchscreen.touchMove(a.x + 90, a.cy - i * 25); await sleep(12); sawOverlay ||= (await dragState(phone, melon.id)).overlay }
    await phone.touchscreen.touchEnd()
    await sleep(500)
    sawOverlay ||= (await dragState(phone, melon.id)).overlay
    const y1 = await phone.evaluate(() => window.scrollY)
    m = (await meals()).find((x) => x.id === melon.id)
    check('swipe: no drag starts', !sawOverlay && m?.planned_for === day(1) && m?.slot === 'dinner', `overlay=${sawOverlay} ${where(m)}`)
    console.log(`   (info) swipe scrolled the page by ${Math.round(y1 - y0)} px`)
  }

  // 7. a tap on J+L still cycles who's eating
  {
    const badge = `${chip(melon.id)} button[aria-label^="Who"]`
    const before = (await meals()).find((x) => x.id === melon.id).eaters
    await phone.tap(badge)
    m = await waitMeal(melon.id, (x) => x.eaters !== before)
    check('tap: J+L badge cycles eaters', m?.eaters !== before, `${before} -> ${m?.eaters}`)
    for (let i = 0; i < 3 && m?.eaters !== before; i++) { await phone.tap(badge); await sleep(900); m = (await meals()).find((x) => x.id === melon.id) }
    check('tap: eaters restored', m?.eaters === before, m?.eaters)
  }

  // 8. press and hold, then let go in place: no move, no navigation
  {
    await scrollTo(phone, chip(wrapWed.id), 400)
    const a = await rectOf(phone, chip(wrapWed.id))
    await phone.touchscreen.touchStart(a.x + 90, a.cy)
    await sleep(450)
    const s = await dragState(phone, wrapWed.id)
    await phone.touchscreen.touchEnd()
    await sleep(900)
    m = (await meals()).find((x) => x.id === wrapWed.id)
    check('hold + release in place: lifted, then nothing changes', s.overlay && phone.url().includes('/plan?week=') && m?.planned_for === day(2), `overlay=${s.overlay} url=${phone.url()} ${where(m)}`)
  }

  // 9. a plain tap on the title still opens the recipe
  {
    await Promise.all([phone.waitForNavigation({ timeout: 60000 }).catch(() => null), phone.tap(`${chip(wrapWed.id)} a`)])
    await sleep(500)
    check('tap: title opens the recipe', phone.url().includes('/recipes/'), phone.url())
    await phone.goBack({ waitUntil: 'networkidle2' })
    await phone.waitForSelector(chip(soup.id))
    await phone.waitForFunction(() => document.body.textContent.includes('● live'), { timeout: 30000 }).catch(() => {})
  }

  // 10. long drag with auto-scroll: Mon breakfast -> Sat dinner
  {
    await scrollTo(phone, chip(yogurt.id), 160)
    const a = await rectOf(phone, chip(yogurt.id))
    const sx = a.x + 90, sy = a.cy
    await phone.touchscreen.touchStart(sx, sy)
    await sleep(420)
    for (let i = 1; i <= 10; i++) { await phone.touchscreen.touchMove(sx, sy + ((828 - sy) * i) / 10); await sleep(16) }
    const t0 = Date.now()
    while (Date.now() - t0 < 9000) {
      await phone.touchscreen.touchMove(sx, 828 + ((Date.now() / 50) % 2)) // keep the finger alive at the bottom edge
      if ((await rectOf(phone, slot(day(5), 'dinner'))).cy < 700) break
      await sleep(60)
    }
    await phone.screenshot({ path: path.join(OUT, '05-phone-autoscroll.png') })
    let fy = 828
    for (let i = 1; i <= 8; i++) { const cy = (await rectOf(phone, slot(day(5), 'dinner'))).cy; fy += (cy - fy) / (9 - i); await phone.touchscreen.touchMove(sx, fy); await sleep(16) }
    await sleep(300)
    mid = await dragState(phone, yogurt.id)
    await phone.touchscreen.touchEnd()
    m = await waitMeal(yogurt.id, (x) => x.planned_for === day(5) && x.slot === 'dinner')
    check('auto-scroll: long drag reaches Sat dinner', m?.planned_for === day(5) && m?.slot === 'dinner', `${where(m)} caption=${mid.caption}`)
  }

  // ======================= DESKTOP (mouse) =======================
  await desk.bringToFront()
  await desk.reload({ waitUntil: 'networkidle2' })
  await desk.waitForSelector(chip(wrapWed.id))
  await desk.waitForFunction(() => document.body.textContent.includes('● live'), { timeout: 30000 }).catch(() => {})
  await desk.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it')?.click())
  await scrollTo(desk, slot(day(2), 'breakfast'), 150)
  {
    const a = await rectOf(desk, chip(wrapWed.id))
    const b = await rectOf(desk, slot(day(3), 'lunch'))
    await desk.mouse.move(a.x + 120, a.cy)
    await desk.mouse.down()
    await desk.mouse.move(b.x + b.w * 0.5, b.cy, { steps: 24 })
    await sleep(300)
    const s = await dragState(desk, wrapWed.id)
    await desk.screenshot({ path: path.join(OUT, '06-desktop-dragging.png') })
    await desk.mouse.up()
    m = await waitMeal(wrapWed.id, (x) => x.planned_for === day(3) && x.slot === 'lunch')
    check('mouse: drag Wed breakfast -> Thu lunch', m?.planned_for === day(3) && m?.slot === 'lunch', `${where(m)} caption=${s.caption}`)
    check('mouse: no navigation on drop', desk.url().includes('/plan?week='), desk.url())
  }
  {
    // grab the title, wander off and come back, let go: nothing moves, and no click goes through
    await sleep(500)
    const a = await rectOf(desk, chip(melon.id))
    await desk.mouse.move(a.x + 120, a.cy)
    await desk.mouse.down()
    await desk.mouse.move(a.x + 120, a.cy - 120, { steps: 12 })
    await desk.mouse.move(a.x + 120, a.cy, { steps: 12 })
    await sleep(200)
    await desk.mouse.up()
    await sleep(1200)
    m = (await meals()).find((x) => x.id === melon.id)
    check('mouse: drop back in place does not open the recipe', desk.url().includes('/plan?week=') && m?.planned_for === day(1) && m?.slot === 'dinner', `${desk.url()} ${where(m)}`)
  }
  {
    await scrollTo(desk, chip(melon.id), 300) // clear of the fixed tab bar
    await Promise.all([desk.waitForNavigation({ timeout: 60000 }).catch(() => null), desk.click(`${chip(melon.id)} a`)])
    await sleep(500)
    check('mouse: a click on the title still opens the recipe', desk.url().includes('/recipes/'), desk.url())
  }

  // ======================= API =======================
  {
    const r = await api('PATCH', `/api/plan/meals/${left.id}`, { planned_for: day(0), slot: 'lunch', position: 0 })
    check('server refuses leftovers before their meal (409)', r.status === 409 && r.j.error === `Leftovers have to come after ${lab(0, 'dinner')}`, `${r.status} ${JSON.stringify(r.j)}`)
  }
} finally {
  await browser.close()
  // ---- clean up the sandbox week, pass or fail ----
  const cleared = await api('POST', '/api/plan/clear', { week_of: WEEK })
  const after = await meals()
  check('sandbox week cleared', after.length === 0, `${JSON.stringify(cleared.j)} left=${after.length}`)
}

console.log('\nconsole errors:', errors.length ? errors : 'none')
console.log(`screenshots: ${OUT}`)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length || errors.length ? 1 : 0)
