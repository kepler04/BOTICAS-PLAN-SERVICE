/**
 * Registra el service worker solo en producción (en desarrollo una caché de archivos estorbaría el HMR).
 * Ver public/sw.js: hace la app instalable y muestra una página clara sin conexión; no cachea datos.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual (solo deja de ser instalable).
    })
  })
}
