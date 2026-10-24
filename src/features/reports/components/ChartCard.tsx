import { useState, type ReactNode } from 'react'
import { BarChart3, Download, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TableView } from '@/features/reports/lib/tables'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ChartCardProps = {
  title: string
  description?: string
  /** Equivalente en tabla del gráfico: toda la información sin depender del color ni del hover. */
  table: TableView
  onDownload?: () => void
  /** Recalculando: se mantiene el gráfico anterior, atenuado (sin esqueletos ni saltos de diseño). */
  fetching?: boolean
  children: ReactNode
}

/** Tarjeta de gráfico con su vista de tabla equivalente y descarga a CSV. */
export function ChartCard({ title, description, table, onDownload, fetching, children }: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Forma de ver los datos" className="flex rounded-lg border p-0.5">
            <Button
              type="button"
              size="xs"
              variant={view === 'chart' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'chart'}
              onClick={() => setView('chart')}
            >
              <BarChart3 aria-hidden="true" />
              Gráfico
            </Button>
            <Button
              type="button"
              size="xs"
              variant={view === 'table' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <Table2 aria-hidden="true" />
              Tabla
            </Button>
          </div>
          {onDownload ? (
            <Button type="button" size="xs" variant="outline" onClick={onDownload}>
              <Download aria-hidden="true" />
              CSV
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={fetching ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={fetching || undefined}>
        {view === 'chart' ? (
          children
        ) : (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.headers.map((h, i) => (
                    <TableHead key={h} className={i === 0 ? '' : 'text-right'}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row, r) => (
                  <TableRow key={r}>
                    {row.map((cell, c) => (
                      <TableCell key={c} className={c === 0 ? 'whitespace-normal' : 'text-right tabular-nums'}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
