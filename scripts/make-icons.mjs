// Genera los íconos PNG de la PWA a partir de public/favicon.svg e icon-maskable.svg.
//   npm run icons        (usa Edge/Chrome ya instalados; E2E_BROWSER para otra ruta)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BROWSER = [
  process.env.E2E_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p))
if (!BROWSER) {
  console.error('No encontré Edge ni Chrome. Define E2E_BROWSER con la ruta del ejecutable.')
  process.exit(1)
}

const targets = [
  { svg: 'public/favicon.svg', out: 'public/icon-192.png', size: 192, transparent: true },
  { svg: 'public/favicon.svg', out: 'public/icon-512.png', size: 512, transparent: true },
  { svg: 'public/icon-maskable.svg', out: 'public/icon-maskable-512.png', size: 512, transparent: false },
  // iOS pone sus propias esquinas: sin transparencia.
  { svg: 'public/icon-maskable.svg', out: 'public/apple-touch-icon.png', size: 180, transparent: false },
]

const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
try {
  for (const t of targets) {
    const svg = readFileSync(t.svg, 'utf8')
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${t.size}px;height:${t.size}px}</style><img src="${dataUrl}">`)
    await page.waitForFunction(() => document.images[0].complete)
    writeFileSync(t.out, await page.screenshot({ omitBackground: t.transparent }))
    await page.close()
    console.log(`✔ ${t.out} (${t.size}×${t.size})`)
  }
} finally {
  await browser.close()
}
