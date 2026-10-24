import { supabase } from '@/lib/supabase'

export const dashboardService = {
  async getProfileName(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error('No se pudo cargar tu perfil.')
    return data?.full_name ?? null
  },
}
