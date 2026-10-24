import { AlertTriangle, CheckCircle2, FileDown } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ReadingForm } from '@/features/sanitary/components/ReadingForm'
import { HISTORY_DAYS, useEnvironmentLimits, useEnvironmentReadings } from '@/features/sanitary/hooks/useEnvironment'
import { AREA_LABELS, summarizeByDay, type EnvironmentReading } from '@/features/sanitary/lib/environment'
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv'
import { addDaysISO, formatDate, todayISO } from '@/lib/format'

const time = new Intl.DateTimeFormat('es-PE', { timeStyle: 'short' })
const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1))

const CSV_COLUMNS: CsvColumn<EnvironmentReading>[] = [
  { header: 'Fecha', value: (r) => formatDate(r.recordedOn) },
  { header: 'Hora', value: (r) => time.format(new Date(r.recordedAt)) },
  { header: 'Área', value: (r) => AREA_LABELS[r.area] },
  { header: 'Temperatura (°C)', value: (r) => r.temperature.toFixed(1) },
  { header: 'Humedad (%)', value: (r) => (r.humidity === null ? '' : r.humidity.toFixed(1)) },
  { header: 'Fuera de rango', value: (r) => (r.outOfRange ? 'Sí' : 'No') },
  { header: 'Acción tomada', value: (r) => r.note },
  { header: 'Registró', value: (r) => r.recordedBy },
]

export function TemperaturePage() {
  const limits = useEnvironmentLimits()
  const readings = useEnvironmentReadings()
  const today = todayISO()
  const rows = readings.data ?? []
  const todayRows = rows.filter((r) => r.recordedOn === today)
  const missingToday = readings.isSuccess && !todayRows.some((r) => r.area === 'room')
  const days = summarizeByDay(rows, addDaysISO(-(HISTORY_DAYS - 1)), today)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Temperatura y humedad"
        description="Registro diario del local para la inspección sanitaria."
        actions={
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(`temperatura-${today}.csv`, toCsv(CSV_COLUMNS, [...rows].reverse()))}
          >
            <FileDown aria-hidden="true" />
            Exportar CSV
          </Button>
        }
      />

      {missingToday ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Aún no se registra la temperatura de hoy.
        </div>
      ) : readings.isSuccess ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Hoy ya hay {todayRows.length} {todayRows.length === 1 ? 'lectura' : 'lecturas'}.
        </div>
      ) : null}

      {limits.isError ? <ErrorMessage message={limits.error.message} /> : null}
      {limits.isPending ? <Skeleton className="h-48 w-full" /> : null}
      {limits.isSuccess ? (
        <div className="grid gap-4 md:grid-cols-2">
          {limits.data.map((l) => (
            <ReadingForm key={l.area} limit={l} />
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Los rangos son de referencia. Confírmalos con tu químico farmacéutico según lo que indique cada producto. Las
        lecturas no se pueden editar ni borrar: si te equivocaste, registra otra con una nota.
      </p>

      {readings.isError ? <ErrorMessage message={readings.error.message} /> : null}

      {todayRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Lecturas de hoy</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">°C</TableHead>
                  <TableHead className="text-right">Humedad</TableHead>
                  <TableHead className="hidden sm:table-cell">Registró</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{time.format(new Date(r.recordedAt))}</TableCell>
                    <TableCell className="whitespace-normal">
                      {AREA_LABELS[r.area]}
                      {r.outOfRange ? (
                        <div className="text-xs text-destructive">Fuera de rango · {r.note}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.temperature.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.humidity === null ? '—' : `${r.humidity.toFixed(1)} %`}</TableCell>
                    <TableCell className="hidden sm:table-cell">{r.recordedBy ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Últimos {HISTORY_DAYS} días</CardTitle>
          <CardDescription>Lo que revisa una inspección: que no falte ningún día y qué se hizo cuando algo salió de rango.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {readings.isPending ? <Skeleton className="m-4 h-40" /> : null}
          {readings.isSuccess ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ambiente (°C)</TableHead>
                  <TableHead className="hidden sm:table-cell">Humedad máx.</TableHead>
                  <TableHead>Refrigeración (°C)</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.day}>
                    <TableCell>{formatDate(d.day)}</TableCell>
                    <TableCell className="tabular-nums">
                      {d.room.count ? `${fmt(d.room.min)} – ${fmt(d.room.max)}` : '—'}
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {d.room.humidityMax === null ? '—' : `${d.room.humidityMax.toFixed(1)} %`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {d.fridge.count ? `${fmt(d.fridge.min)} – ${fmt(d.fridge.max)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.missingRoom ? (
                        <Badge variant="destructive">Sin registro</Badge>
                      ) : d.outOfRange > 0 ? (
                        <Badge variant="outline" className="border-amber-400 text-amber-800">
                          {d.outOfRange} fuera de rango
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Completo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
