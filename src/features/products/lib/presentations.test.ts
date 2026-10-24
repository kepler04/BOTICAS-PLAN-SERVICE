import { describe, expect, it } from 'vitest'
import {
  availablePresentations,
  formatStock,
  pluralize,
  presentationOptionLabel,
  toBaseUnits,
  unitsPer,
  type PackSpec,
} from '@/features/products/lib/presentations'

const tablet: PackSpec = { unit_label: 'tableta', units_per_blister: 10, units_per_box: 100 }
const syrup: PackSpec = { unit_label: 'frasco', units_per_blister: null, units_per_box: null }
const boxOnly: PackSpec = { unit_label: 'ampolla', units_per_blister: null, units_per_box: 6 }

describe('presentaciones', () => {
  it('lista solo las presentaciones definidas', () => {
    expect(availablePresentations(tablet)).toEqual(['unit', 'blister', 'box'])
    expect(availablePresentations(syrup)).toEqual(['unit'])
    expect(availablePresentations(boxOnly)).toEqual(['unit', 'box'])
  })

  it('convierte a unidades mínimas', () => {
    expect(unitsPer(tablet, 'box')).toBe(100)
    expect(toBaseUnits(tablet, 'box', 3)).toBe(300)
    expect(toBaseUnits(tablet, 'blister', 2)).toBe(20)
    expect(toBaseUnits(tablet, 'unit', 7)).toBe(7)
  })

  it('rechaza cantidades no enteras o no positivas', () => {
    expect(toBaseUnits(tablet, 'unit', 0)).toBeNull()
    expect(toBaseUnits(tablet, 'unit', -1)).toBeNull()
    expect(toBaseUnits(tablet, 'unit', 1.5)).toBeNull()
  })

  it('etiqueta las opciones con su contenido', () => {
    expect(presentationOptionLabel(tablet, 'box')).toBe('Caja (100 tabletas)')
    expect(presentationOptionLabel(tablet, 'unit')).toBe('Unidad (tableta)')
  })
})

describe('formatStock', () => {
  it('descompone en cajas, blísters y unidades', () => {
    expect(formatStock(tablet, 237)).toBe('2 cajas, 3 blísters, 7 tabletas')
    expect(formatStock(tablet, 100)).toBe('1 caja')
    expect(formatStock(tablet, 10)).toBe('1 blíster')
    expect(formatStock(tablet, 1)).toBe('1 tableta')
  })

  it('sin stock', () => {
    expect(formatStock(tablet, 0)).toBe('0 tabletas')
  })

  it('productos sin blíster ni caja muestran solo unidades', () => {
    expect(formatStock(syrup, 12)).toBe('12 frascos')
  })

  it('caja sin blíster salta directo a unidades sueltas', () => {
    expect(formatStock(boxOnly, 13)).toBe('2 cajas, 1 ampolla')
  })
})

describe('pluralize', () => {
  it('aplica reglas simples del español', () => {
    expect(pluralize('tableta', 2)).toBe('tabletas')
    expect(pluralize('unidad', 2)).toBe('unidades')
    expect(pluralize('ml', 2)).toBe('ml')
    expect(pluralize('tableta', 1)).toBe('tableta')
  })
})
