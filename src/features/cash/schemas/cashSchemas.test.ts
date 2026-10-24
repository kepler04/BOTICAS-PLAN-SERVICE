import { describe, expect, it } from 'vitest'
import { cashMovementSchema, closeCashSchema, openCashSchema } from '@/features/cash/schemas/cashSchemas'

describe('cashSchemas', () => {
  it('apertura: acepta 0 y montos con coma o punto', () => {
    expect(openCashSchema.safeParse({ amount: '0' }).success).toBe(true)
    expect(openCashSchema.safeParse({ amount: '50,5' }).success).toBe(true)
  })

  it('apertura: rechaza vacío y texto', () => {
    expect(openCashSchema.safeParse({ amount: '' }).success).toBe(false)
    expect(openCashSchema.safeParse({ amount: 'abc' }).success).toBe(false)
    expect(openCashSchema.safeParse({ amount: '-5' }).success).toBe(false)
  })

  it('movimiento: monto mayor a 0 y motivo obligatorio', () => {
    const ok = { type: 'expense' as const, amount: '5', reason: 'Bolsas' }
    expect(cashMovementSchema.safeParse(ok).success).toBe(true)
    expect(cashMovementSchema.safeParse({ ...ok, amount: '0' }).success).toBe(false)
    expect(cashMovementSchema.safeParse({ ...ok, reason: 'ab' }).success).toBe(false)
  })

  it('cierre: exige el efectivo contado', () => {
    expect(closeCashSchema.safeParse({ counted: '157.50', notes: '' }).success).toBe(true)
    expect(closeCashSchema.safeParse({ counted: '', notes: '' }).success).toBe(false)
  })
})
