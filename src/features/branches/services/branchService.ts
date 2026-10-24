import { supabase } from '@/lib/supabase'

export type MainBranch = {
  id: string
  name: string
  address: string | null
}

export const branchService = {
  /** Sucursal principal activa de la botica (RLS limita el acceso a miembros). */
  async getMainBranch(pharmacyId: string): Promise<MainBranch | null> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address')
      .eq('pharmacy_id', pharmacyId)
      .eq('is_main', true)
      .eq('active', true)
      .maybeSingle()
    if (error) throw new Error('No se pudo cargar la sucursal principal.')
    return data
  },
}
