import { useState } from 'react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { PageHeader } from '@/components/common/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { InventoryTab } from '@/features/reports/components/InventoryTab'
import { ProductsTab } from '@/features/reports/components/ProductsTab'
import { ReportFilters } from '@/features/reports/components/ReportFilters'
import { SalesTab } from '@/features/reports/components/SalesTab'
import { SummaryTab } from '@/features/reports/components/SummaryTab'
import {
  granularityFor,
  isValidRange,
  rangeForPreset,
  type DateRange,
  type RangePreset,
} from '@/features/reports/lib/dateRange'

/** Solo administradores (la ruta lo exige y las funciones de la BD lo vuelven a comprobar). */
export function ReportsPage() {
  const branch = useMainBranch()
  const [preset, setPreset] = useState<RangePreset>('30d')
  const [custom, setCustom] = useState<DateRange>(() => rangeForPreset('30d'))

  const range: DateRange = preset === 'custom' ? custom : rangeForPreset(preset)
  const valid = isValidRange(range)
  const granularity = granularityFor(range)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        description={branch.data ? `Ventas, ganancias y rotación · ${branch.data.name}` : 'Ventas, ganancias y rotación.'}
      />

      {branch.isError ? <ErrorMessage message={branch.error.message} /> : null}
      {branch.isPending ? <Skeleton className="h-10 w-full" /> : null}
      {branch.isSuccess && branch.data === null ? (
        <ErrorMessage title="Falta la sucursal principal" message="Tu botica no tiene una sucursal principal activa, así que no hay reportes que mostrar." />
      ) : null}

      {branch.data ? (
        <>
          <ReportFilters preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />

          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="sales">Ganancia</TabsTrigger>
              <TabsTrigger value="products">Productos</TabsTrigger>
              <TabsTrigger value="inventory">Inventario</TabsTrigger>
            </TabsList>
            {/* Cada pestaña solo consulta cuando se abre. Con un rango inválido no se consulta nada. */}
            <TabsContent value="summary" className="pt-2">
              {valid ? <SummaryTab range={range} granularity={granularity} /> : null}
            </TabsContent>
            <TabsContent value="sales" className="pt-2">
              {valid ? <SalesTab range={range} granularity={granularity} /> : null}
            </TabsContent>
            <TabsContent value="products" className="pt-2">
              {valid ? <ProductsTab range={range} /> : null}
            </TabsContent>
            <TabsContent value="inventory" className="pt-2">
              <InventoryTab />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
