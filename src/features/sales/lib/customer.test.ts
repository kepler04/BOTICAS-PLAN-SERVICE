import { describe, expect, it } from 'vitest'
import { checkCustomer, EMPTY_CUSTOMER } from '@/features/sales/lib/customer'

describe('checkCustomer (regla SUNAT de S/ 700)', () => {
  it('sin cliente: se puede cobrar hasta S/ 700 inclusive', () => {
    expect(checkCustomer(EMPTY_CUSTOMER, 70_000)).toMatchObject({ required: false, ok: true, payload: null })
  })

  it('sin cliente: desde S/ 700.01 no se puede cobrar', () => {
    expect(checkCustomer(EMPTY_CUSTOMER, 70_001)).toMatchObject({ required: true, ok: false, payload: null })
  })

  it('con DNI y nombre válidos se envía normalizado', () => {
    const r = checkCustomer({ docType: 'dni', docNumber: ' 45678912 ', name: '  Rosa Quispe ' }, 75_000)
    expect(r).toMatchObject({ ok: true, payload: { docType: 'dni', docNumber: '45678912', name: 'Rosa Quispe' } })
  })

  it('si se empieza a escribir, documento y nombre deben ser válidos aunque la venta sea pequeña', () => {
    const r = checkCustomer({ docType: 'dni', docNumber: '4567', name: '' }, 1_000)
    expect(r.ok).toBe(false)
    expect(r.docError).toBeTruthy()
    expect(r.nameError).toBeTruthy()
  })

  it('RUC con dígito verificador incorrecto no pasa', () => {
    expect(checkCustomer({ docType: 'ruc', docNumber: '20131312954', name: 'Empresa SAC' }, 1_000).docError).toBeTruthy()
    expect(checkCustomer({ docType: 'ruc', docNumber: '20131312955', name: 'Empresa SAC' }, 1_000).ok).toBe(true)
  })
})
