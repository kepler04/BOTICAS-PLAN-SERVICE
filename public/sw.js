/*
 * Service worker de Boticas ERP. Objetivo: que la app sea INSTALABLE y que, sin internet, se vea una
 * página clara en lugar del error del navegador. NO permite trabajar sin conexión (vender, mover stock):
 * los datos viven en Supabase y una venta sin conexión sería otro proyecto (cola, conflictos, idempotencia).
 *
 * Reglas de seguridad:
 *  - Solo se interceptan peticiones GET del MISMO origen. Supabase (API, Auth, Storage) es otro origen:
 *    JAMÁS se cachea, así que ningún dato de negocio ni token queda en la caché del navegador.
 *  - Solo se cachean archivos estáticos: los de /assets/ (nombre con hash, inmutables) y el precache.
 *  - Para subir una versión nueva basta con cambiar VERSION: se borran las cachés antiguas.
 */
const VERSION = 'v1'
const STATIC_CACHE = `boticas-static-${VERSION}`
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('boticas-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase y demás orígenes: nunca

  // Navegación: siempre red primero (la app debe estar al día); sin red, la página "Sin conexión".
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }

  // Archivos con hash en el nombre: inmutables, primero caché.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
  }
})
