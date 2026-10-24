import { z } from 'zod'

/**
 * zod 4 intenta compilar sus validadores con `new Function` (JIT). Bajo una CSP estricta (sin 'unsafe-eval')
 * el navegador bloquea eso y lo reporta como violación aunque zod lo capture y siga funcionando.
 * `jitless` omite la sonda: validación idéntica, sin ruido en los informes de CSP.
 * Debe importarse ANTES que cualquier módulo que use zod (ver main.tsx).
 */
z.config({ jitless: true })
