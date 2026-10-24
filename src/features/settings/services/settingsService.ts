import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { PharmacySettingsValues } from '@/features/settings/schemas/settingsSchemas'

export class SettingsServiceError extends Error {}

const KNOWN: Record<string, string> = {
  pharmacies_ruc_key: 'Ese RUC ya está registrado en otra botica. Verifica el número.',
}

function fail(error: unknown, fallback: string): never {
  throw new SettingsServiceError(translateDbError(error, KNOWN, fallback))
}

export type PharmacySettings = {
  id: string
  legalName: string
  tradeName: string | null
  ruc: string | null
  chargesIgv: boolean
}

export const settingsService = {
  async getPharmacy(pharmacyId: string): Promise<PharmacySettings> {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('id, legal_name, trade_name, ruc, charges_igv')
      .eq('id', pharmacyId)
      .single()
    if (error) fail(error, 'No se pudo cargar la configuración de la botica.')
    return {
      id: data.id,
      legalName: data.legal_name,
      tradeName: data.trade_name,
      ruc: data.ruc,
      chargesIgv: data.charges_igv,
    }
  },

  async updatePharmacy(pharmacyId: string, v: PharmacySettingsValues): Promise<void> {
    const { data, error } = await supabase
      .from('pharmacies')
      .update({
        legal_name: v.legalName.trim(),
        trade_name: v.tradeName.trim() === '' ? null : v.tradeName.trim(),
        ruc: v.ruc.trim() === '' ? null : v.ruc.trim(),
        charges_igv: v.chargesIgv,
      })
      .eq('id', pharmacyId)
      .select('id')
    if (error) fail(error, 'No se pudo guardar la configuración.')
    // RLS no lanza error si no eres admin: simplemente no modifica filas.
    if (!data || data.length === 0) throw new SettingsServiceError('No tienes permiso para cambiar la configuración.')
  },
}
