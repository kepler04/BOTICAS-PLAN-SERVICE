import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import { sanitizeSearchTerm } from '@/lib/search'
import type { Product } from '@/features/products/types'
import type { ProductPayload } from '@/features/products/schemas/productSchemas'

export const PRODUCTS_PAGE_SIZE = 25

export type ProductStatusFilter = 'active' | 'inactive' | 'all'

export type ProductFilters = {
  search: string
  /** '' = todas, 'none' = sin categoría, o el id de la categoría. */
  categoryId: string
  status: ProductStatusFilter
  page: number
}

export class ProductServiceError extends Error {}

const KNOWN = {
  products_pharmacy_barcode_idx: 'Ya existe un producto con ese código de barras.',
}

function fail(error: unknown, fallback: string): never {
  throw new ProductServiceError(translateDbError(error, KNOWN, fallback))
}

/** Condición `.or()` para buscar por nombre, principio activo o código de barras. */
export function searchFilter(term: string): string | null {
  const clean = sanitizeSearchTerm(term)
  if (!clean) return null
  return `name.ilike.%${clean}%,generic_name.ilike.%${clean}%,barcode.eq.${clean}`
}

export const productService = {
  async list(pharmacyId: string, filters: ProductFilters): Promise<{ rows: Product[]; total: number }> {
    const from = filters.page * PRODUCTS_PAGE_SIZE
    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('pharmacy_id', pharmacyId)
      .order('name')
      .range(from, from + PRODUCTS_PAGE_SIZE - 1)

    if (filters.status === 'active') query = query.eq('active', true)
    if (filters.status === 'inactive') query = query.eq('active', false)
    if (filters.categoryId === 'none') query = query.is('category_id', null)
    else if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
    const or = searchFilter(filters.search)
    if (or) query = query.or(or)

    const { data, error, count } = await query
    if (error) fail(error, 'No se pudieron cargar los productos.')
    return { rows: data ?? [], total: count ?? 0 }
  },

  /** Búsqueda rápida de productos activos (selector de producto y lector de código de barras). */
  async search(pharmacyId: string, term: string, limit = 8): Promise<Product[]> {
    let query = supabase
      .from('products')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .eq('active', true)
      .order('name')
      .limit(limit)
    const or = searchFilter(term)
    if (or) query = query.or(or)
    const { data, error } = await query
    if (error) fail(error, 'No se pudo buscar productos.')
    return data ?? []
  },

  /** Todos los productos activos (para el reporte de precios a DIGEMID). */
  async listForPriceReport(pharmacyId: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .eq('active', true)
      .order('name')
      .limit(5000)
    if (error) fail(error, 'No se pudo preparar la lista de precios.')
    return data ?? []
  },

  async create(pharmacyId: string, payload: ProductPayload): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...payload, pharmacy_id: pharmacyId })
      .select('*')
      .single()
    if (error) fail(error, 'No se pudo crear el producto.')
    return data
  },

  async update(id: string, payload: ProductPayload): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) fail(error, 'No se pudo guardar el producto.')
    return data
  },
}
