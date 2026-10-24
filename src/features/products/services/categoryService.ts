import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { Category } from '@/features/products/types'

export class CategoryServiceError extends Error {}

const KNOWN = {
  categories_pharmacy_name_idx: 'Ya existe una categoría con ese nombre.',
}

function fail(error: unknown, fallback: string): never {
  throw new CategoryServiceError(translateDbError(error, KNOWN, fallback))
}

export const categoryService = {
  async list(pharmacyId: string): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('name')
    if (error) fail(error, 'No se pudieron cargar las categorías.')
    return data ?? []
  },

  async create(pharmacyId: string, name: string): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .insert({ pharmacy_id: pharmacyId, name: name.trim() })
      .select('*')
      .single()
    if (error) fail(error, 'No se pudo crear la categoría.')
    return data
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id)
    if (error) fail(error, 'No se pudo renombrar la categoría.')
  },

  /** Los productos de la categoría quedan "sin categoría" (lo resuelve la BD). */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) fail(error, 'No se pudo eliminar la categoría.')
  },
}
