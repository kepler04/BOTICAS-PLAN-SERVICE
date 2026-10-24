import { supabase } from '@/lib/supabase'
import { translateDbError } from '@/lib/dbErrors'
import type { Tables } from '@/types/database.types'

export const CASH_HISTORY_PAGE_SIZE = 15

export class CashServiceError extends Error {}

const KNOWN: Record<string, string> = {
  session_already_open: 'Ya hay una caja abierta en esta sucursal.',
  cash_session_closed: 'Esta caja ya está cerrada.',
  invalid_amount: 'El monto no es válido.',
  reason_required: 'Escribe el motivo (mínimo 3 letras).',
  difference_note_required: 'Hay diferencia entre lo contado y lo esperado: escribe una nota explicando el motivo.',
  forbidden: 'No tienes permiso para hacer esto.',
  not_authenticated: 'Tu sesión expiró. Inicia sesión nuevamente.',
}

function fail(error: unknown, fallback: string): never {
  throw new CashServiceError(translateDbError(error, KNOWN, fallback))
}

export type CashSummary = {
  id: string
  branchId: string
  status: 'open' | 'closed'
  openedAt: string
  openedByName: string | null
  closedAt: string | null
  closedByName: string | null
  openingAmount: number
  countedCash: number | null
  difference: number | null
  notes: string | null
  cashSales: number
  yapeSales: number
  plinSales: number
  cardSales: number
  salesCount: number
  voidedCount: number
  incomeTotal: number
  expenseTotal: number
  expectedCash: number
}

type SummaryRow = {
  id: string | null
  branch_id: string | null
  status: 'open' | 'closed' | null
  opened_at: string | null
  opened_by_name: string | null
  closed_at: string | null
  closed_by_name: string | null
  opening_amount: number | null
  counted_cash: number | null
  difference: number | null
  notes: string | null
  cash_sales: number | null
  yape_sales: number | null
  plin_sales: number | null
  card_sales: number | null
  sales_count: number | null
  voided_count: number | null
  income_total: number | null
  expense_total: number | null
  expected_cash: number | null
}

function toSummary(r: SummaryRow): CashSummary {
  return {
    id: r.id ?? '',
    branchId: r.branch_id ?? '',
    status: r.status ?? 'closed',
    openedAt: r.opened_at ?? '',
    openedByName: r.opened_by_name,
    closedAt: r.closed_at,
    closedByName: r.closed_by_name,
    openingAmount: Number(r.opening_amount ?? 0),
    countedCash: r.counted_cash === null ? null : Number(r.counted_cash),
    difference: r.difference === null ? null : Number(r.difference),
    notes: r.notes,
    cashSales: Number(r.cash_sales ?? 0),
    yapeSales: Number(r.yape_sales ?? 0),
    plinSales: Number(r.plin_sales ?? 0),
    cardSales: Number(r.card_sales ?? 0),
    salesCount: r.sales_count ?? 0,
    voidedCount: r.voided_count ?? 0,
    incomeTotal: Number(r.income_total ?? 0),
    expenseTotal: Number(r.expense_total ?? 0),
    expectedCash: Number(r.expected_cash ?? 0),
  }
}

export type CashMovementRow = Tables<'cash_movements'> & {
  profiles: { full_name: string | null } | null
}

export type CloseResult = { expected: number; counted: number; difference: number }

export const cashService = {
  /** Caja abierta de la sucursal, o null si no hay. */
  async getOpenSession(branchId: string): Promise<CashSummary | null> {
    const { data, error } = await supabase
      .from('cash_session_summary')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle()
    if (error) fail(error, 'No se pudo consultar la caja.')
    return data ? toSummary(data) : null
  },

  async listSessions(branchId: string, page: number): Promise<{ rows: CashSummary[]; total: number }> {
    const from = page * CASH_HISTORY_PAGE_SIZE
    const { data, error, count } = await supabase
      .from('cash_session_summary')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('opened_at', { ascending: false })
      .range(from, from + CASH_HISTORY_PAGE_SIZE - 1)
    if (error) fail(error, 'No se pudo cargar el historial de cajas.')
    return { rows: (data ?? []).map(toSummary), total: count ?? 0 }
  },

  async listMovements(sessionId: string): Promise<CashMovementRow[]> {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*, profiles(full_name)')
      .eq('cash_session_id', sessionId)
      .order('id', { ascending: false })
    if (error) fail(error, 'No se pudieron cargar los movimientos.')
    return (data ?? []) as CashMovementRow[]
  },

  async openSession(branchId: string, openingAmount: number): Promise<string> {
    const { data, error } = await supabase.rpc('open_cash_session', {
      p_branch: branchId,
      p_opening_amount: openingAmount,
    })
    if (error) fail(error, 'No se pudo abrir la caja.')
    return data
  },

  async addMovement(sessionId: string, type: 'income' | 'expense', amount: number, reason: string): Promise<void> {
    const { error } = await supabase.rpc('add_cash_movement', {
      p_session: sessionId,
      p_type: type,
      p_amount: amount,
      p_reason: reason,
    })
    if (error) fail(error, 'No se pudo registrar el movimiento.')
  },

  async closeSession(sessionId: string, counted: number, notes: string | null): Promise<CloseResult> {
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session: sessionId,
      p_counted_cash: counted,
      p_notes: notes ?? undefined,
    })
    if (error) fail(error, 'No se pudo cerrar la caja.')
    const r = (data ?? {}) as { expected?: number; counted?: number; difference?: number }
    return { expected: Number(r.expected ?? 0), counted: Number(r.counted ?? 0), difference: Number(r.difference ?? 0) }
  },
}
