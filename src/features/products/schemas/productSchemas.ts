import { z } from 'zod'
import { parseInteger, parseMoney } from '@/lib/format'
import type { Product } from '@/features/products/types'
import type { TablesInsert } from '@/types/database.types'

/**
 * El formulario trabaja con texto (inputs) y se valida con superRefine;
 * `toProductPayload` convierte a los tipos de la BD solo después de validar.
 */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Ingresa el nombre del producto').max(200, 'El nombre es demasiado largo'),
    genericName: z.string().trim().max(200, 'Máximo 200 caracteres'),
    concentration: z.string().trim().max(100, 'Máximo 100 caracteres'),
    laboratory: z.string().trim().max(120, 'Máximo 120 caracteres'),
    barcode: z
      .string()
      .trim()
      .refine((v) => v === '' || (v.length >= 3 && v.length <= 64), 'El código debe tener entre 3 y 64 caracteres'),
    sanitaryRegistry: z.string().trim().max(50, 'Máximo 50 caracteres'),
    digemidCode: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{1,10}$/.test(v), 'El código DIGEMID es numérico (hasta 10 dígitos)'),
    categoryId: z.string(),
    requiresPrescription: z.boolean(),
    taxAffectation: z.enum(['gravado', 'exonerado', 'inafecto']),
    unitLabel: z.string().trim().min(1, 'Indica la unidad (tableta, frasco...)').max(30, 'Máximo 30 caracteres'),
    priceUnit: z.string().trim(),
    sellsBlister: z.boolean(),
    unitsPerBlister: z.string().trim(),
    priceBlister: z.string().trim(),
    sellsBox: z.boolean(),
    unitsPerBox: z.string().trim(),
    priceBox: z.string().trim(),
    minStock: z.string().trim(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: keyof ProductFormValues, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })

    if (parseMoney(v.priceUnit) === null) fail('priceUnit', 'Ingresa un precio válido, p. ej. 0.50')
    if (parseInteger(v.minStock) === null) fail('minStock', 'Ingresa un número entero (0 = sin alerta)')

    const perBlister = parseInteger(v.unitsPerBlister)
    const perBox = parseInteger(v.unitsPerBox)

    if (v.sellsBlister) {
      if (perBlister === null || perBlister < 2) fail('unitsPerBlister', 'Debe traer al menos 2 unidades')
      if (parseMoney(v.priceBlister) === null) fail('priceBlister', 'Ingresa un precio válido')
    }
    if (v.sellsBox) {
      if (perBox === null || perBox < 2) fail('unitsPerBox', 'Debe traer al menos 2 unidades')
      if (parseMoney(v.priceBox) === null) fail('priceBox', 'Ingresa un precio válido')
    }
    if (v.sellsBlister && v.sellsBox && perBlister !== null && perBox !== null && perBlister >= 2) {
      if (perBox < perBlister || perBox % perBlister !== 0) {
        fail('unitsPerBox', `La caja debe tener un múltiplo de ${perBlister} (blísters completos)`)
      }
    }
  })

export type ProductFormValues = z.infer<typeof productFormSchema>

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  genericName: '',
  concentration: '',
  laboratory: '',
  barcode: '',
  sanitaryRegistry: '',
  digemidCode: '',
  categoryId: '',
  requiresPrescription: false,
  taxAffectation: 'gravado',
  unitLabel: 'unidad',
  priceUnit: '',
  sellsBlister: false,
  unitsPerBlister: '',
  priceBlister: '',
  sellsBox: false,
  unitsPerBox: '',
  priceBox: '',
  minStock: '0',
  active: true,
}

export function productToFormValues(p: Product): ProductFormValues {
  return {
    name: p.name,
    genericName: p.generic_name ?? '',
    concentration: p.concentration ?? '',
    laboratory: p.laboratory ?? '',
    barcode: p.barcode ?? '',
    sanitaryRegistry: p.sanitary_registry ?? '',
    digemidCode: p.digemid_code ?? '',
    categoryId: p.category_id ?? '',
    requiresPrescription: p.requires_prescription,
    taxAffectation: p.tax_affectation,
    unitLabel: p.unit_label,
    priceUnit: p.price_unit.toFixed(2),
    sellsBlister: p.units_per_blister !== null,
    unitsPerBlister: p.units_per_blister?.toString() ?? '',
    priceBlister: p.price_blister?.toFixed(2) ?? '',
    sellsBox: p.units_per_box !== null,
    unitsPerBox: p.units_per_box?.toString() ?? '',
    priceBox: p.price_box?.toFixed(2) ?? '',
    minStock: p.min_stock.toString(),
    active: p.active,
  }
}

export type ProductPayload = Omit<TablesInsert<'products'>, 'pharmacy_id' | 'id'>

const orNull = (v: string) => (v.trim() === '' ? null : v.trim())

/** Convierte valores YA validados del formulario al formato de la tabla `products`. */
export function toProductPayload(v: ProductFormValues): ProductPayload {
  return {
    name: v.name.trim(),
    generic_name: orNull(v.genericName),
    concentration: orNull(v.concentration),
    laboratory: orNull(v.laboratory),
    barcode: orNull(v.barcode),
    sanitary_registry: orNull(v.sanitaryRegistry),
    digemid_code: orNull(v.digemidCode),
    category_id: v.categoryId === '' ? null : v.categoryId,
    requires_prescription: v.requiresPrescription,
    tax_affectation: v.taxAffectation,
    unit_label: v.unitLabel.trim(),
    price_unit: parseMoney(v.priceUnit) ?? 0,
    units_per_blister: v.sellsBlister ? parseInteger(v.unitsPerBlister) : null,
    price_blister: v.sellsBlister ? parseMoney(v.priceBlister) : null,
    units_per_box: v.sellsBox ? parseInteger(v.unitsPerBox) : null,
    price_box: v.sellsBox ? parseMoney(v.priceBox) : null,
    min_stock: parseInteger(v.minStock) ?? 0,
    active: v.active,
  }
}
