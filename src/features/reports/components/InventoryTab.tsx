import { AlertTriangle, Clock, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiTile } from '@/features/reports/components/KpiTile'
import { useInventoryValue } from '@/features/reports/hooks/useReports'
import { formatPEN } from '@/lib/format'
import { PATHS } from '@/routes/paths'

/** Foto actual del inventario a costo y dinero en riesgo por vencimiento. */
export function InventoryTab() {
  const value = useInventoryValue()
  const v = value.data
  const atRisk = v ? v.expiredCost + v.expiring30Cost + v.expiring60Cost + v.expiring90Cost : 0

  return (
    <div className="space-y-4">
      {value.error ? <ErrorMessage message={value.error.message} /> : null}

      <section aria-label="Valor del inventario" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiTile label="Inventario a costo" value={formatPEN(v?.stockCost ?? 0)} hint="Lo que costó lo que tienes en stock" loading={value.isPending} />
        <KpiTile label="Unidades en stock" value={String(v?.stockUnits ?? 0)} hint="En unidad mínima" loading={value.isPending} />
        <KpiTile label="Productos con stock" value={String(v?.productsWithStock ?? 0)} loading={value.isPending} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Dinero en riesgo por vencimiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {v ? (
            <>
              <p className="text-sm text-muted-foreground">
                Valor a costo de los lotes con stock, según cuándo vencen. En total hay{' '}
                <strong className="text-foreground">{formatPEN(atRisk)}</strong> que vence en los próximos 90 días o ya venció.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <RiskItem icon={<XCircle className="size-4" aria-hidden="true" />} label="Ya vencido" amount={v.expiredCost} critical />
                <RiskItem icon={<AlertTriangle className="size-4" aria-hidden="true" />} label="Vence en 0–30 días" amount={v.expiring30Cost} />
                <RiskItem icon={<Clock className="size-4" aria-hidden="true" />} label="Vence en 31–60 días" amount={v.expiring60Cost} />
                <RiskItem icon={<Clock className="size-4" aria-hidden="true" />} label="Vence en 61–90 días" amount={v.expiring90Cost} />
              </ul>
              <Link to={PATHS.inventory} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Ver lotes en Inventario
              </Link>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function RiskItem({ icon, label, amount, critical }: { icon: React.ReactNode; label: string; amount: number; critical?: boolean }) {
  // Ícono + texto + cifra: el estado nunca depende solo del color.
  return (
    <li className="rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums" style={critical && amount > 0 ? { color: 'var(--viz-bad)' } : undefined}>
        {formatPEN(amount)}
      </p>
    </li>
  )
}
