import { supabase } from '@/lib/supabase'
import type { RegisterPharmacyValues } from '@/features/onboarding/schemas/pharmacySchemas'

/** Error de servicio con mensaje ya traducido al español. */
export class PharmacyServiceError extends Error {}

const MESSAGES: Record<string, string> = {
  already_has_pharmacy: 'Tu cuenta ya tiene una botica registrada.',
  ruc_taken: 'Ese RUC ya está registrado en otra botica. Verifica el número.',
  invalid_ruc: 'El RUC debe tener 11 dígitos y empezar con 10 o 20.',
  invalid_legal_name: 'Ingresa un nombre válido para la botica.',
  invalid_trade_name: 'El nombre comercial es demasiado largo.',
  not_authenticated: 'Tu sesión expiró. Inicia sesión nuevamente.',
}

export function translatePharmacyError(error: { message?: string }): string {
  const text = error.message ?? ''
  const known = Object.keys(MESSAGES).find((key) => text.includes(key))
  if (known) return MESSAGES[known]!
  if (text.toLowerCase().includes('failed to fetch')) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión a internet.'
  }
  return 'No se pudo registrar la botica. Inténtalo nuevamente.'
}

export const pharmacyService = {
  /** Crea la botica (en prueba), su sucursal principal y te deja como administrador. */
  async register(values: RegisterPharmacyValues): Promise<string> {
    const { data, error } = await supabase.rpc('register_pharmacy', {
      p_legal_name: values.legalName,
      p_trade_name: values.tradeName || undefined,
      p_ruc: values.ruc || undefined,
    })
    if (error) throw new PharmacyServiceError(translatePharmacyError(error))
    return data
  },
}
