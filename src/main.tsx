import '@/lib/zodConfig' // primero: configura zod antes de que cualquier módulo lo use
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ConfigMissingScreen } from '@/components/common/ConfigMissingScreen'
import { registerServiceWorker } from '@/app/pwa'
import { envResult } from '@/lib/env'

const container = document.getElementById('root')
if (!container) throw new Error('No se encontró el elemento #root')
const root = createRoot(container)

async function bootstrap() {
  if (!envResult.ok) {
    root.render(
      <StrictMode>
        <ConfigMissingScreen issues={envResult.issues} />
      </StrictMode>,
    )
    return
  }
  // Import dinámico: el cliente de Supabase solo se crea si el entorno es válido.
  const { App } = await import('@/app/App')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
registerServiceWorker()
