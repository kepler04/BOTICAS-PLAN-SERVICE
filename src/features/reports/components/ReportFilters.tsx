import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PRESET_LABELS,
  isValidRange,
  type DateRange,
  type RangePreset,
} from '@/features/reports/lib/dateRange'

type ReportFiltersProps = {
  preset: RangePreset
  onPreset: (p: RangePreset) => void
  custom: DateRange
  onCustom: (r: DateRange) => void
}

const PRESETS: RangePreset[] = ['today', '7d', '30d', 'month', 'lastMonth', 'custom']

/** Una sola fila de filtros sobre todo lo que gobierna: los rangos predefinidos primero, el personalizado al final. */
export function ReportFilters({ preset, onPreset, custom, onCustom }: ReportFiltersProps) {
  const invalid = preset === 'custom' && !isValidRange(custom)
  return (
    <div className="space-y-2" role="group" aria-label="Periodo del reporte">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? 'default' : 'outline'}
            aria-pressed={preset === p}
            onClick={() => onPreset(p)}
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="report-from" className="text-xs font-medium text-muted-foreground">
              Desde
            </label>
            <Input
              id="report-from"
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => onCustom({ ...custom, from: e.target.value })}
              aria-invalid={invalid || undefined}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="report-to" className="text-xs font-medium text-muted-foreground">
              Hasta
            </label>
            <Input
              id="report-to"
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => onCustom({ ...custom, to: e.target.value })}
              aria-invalid={invalid || undefined}
            />
          </div>
          {invalid ? (
            <p role="alert" className="pb-2 text-sm text-destructive">
              Elige fechas válidas: “Desde” no puede ser posterior a “Hasta” y el máximo es de ~3 años.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
