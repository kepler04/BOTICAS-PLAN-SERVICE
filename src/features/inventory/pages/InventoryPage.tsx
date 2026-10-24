import { useState } from 'react'
import { PackagePlus } from 'lucide-react'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsAdmin } from '@/features/auth/hooks/useIsAdmin'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { AlertsTab } from '@/features/inventory/components/AlertsTab'
import { KardexTab } from '@/features/inventory/components/KardexTab'
import { MovementsTab } from '@/features/inventory/components/MovementsTab'
import { StockEntryDialog } from '@/features/inventory/components/StockEntryDialog'
import { StockTab } from '@/features/inventory/components/StockTab'

export function InventoryPage() {
  const isAdmin = useIsAdmin()
  const branch = useMainBranch()
  const [entryOpen, setEntryOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventario"
        description={
          branch.data
            ? `Existencias, lotes y vencimientos · ${branch.data.name}`
            : 'Existencias, lotes y vencimientos.'
        }
        actions={
          isAdmin ? (
            <Button onClick={() => setEntryOpen(true)} disabled={!branch.data}>
              <PackagePlus aria-hidden="true" />
              Registrar entrada
            </Button>
          ) : null
        }
      />

      {branch.isPending ? <Skeleton className="h-10 w-full" /> : null}
      {branch.isError ? <ErrorMessage message={branch.error.message} /> : null}
      {branch.isSuccess && branch.data === null ? (
        <ErrorMessage
          title="Falta la sucursal principal"
          message="Tu botica no tiene una sucursal principal activa, así que no se puede mostrar el inventario."
        />
      ) : null}

      {branch.data ? (
        <Tabs defaultValue="stock">
          <TabsList>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
            {isAdmin ? <TabsTrigger value="movements">Movimientos</TabsTrigger> : null}
            {isAdmin ? <TabsTrigger value="kardex">Kardex</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="stock" className="pt-2">
            <StockTab />
          </TabsContent>
          <TabsContent value="alerts" className="pt-2">
            <AlertsTab />
          </TabsContent>
          {isAdmin ? (
            <TabsContent value="movements" className="pt-2">
              <MovementsTab />
            </TabsContent>
          ) : null}
          {isAdmin ? (
            <TabsContent value="kardex" className="pt-2">
              <KardexTab />
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}

      {isAdmin ? <StockEntryDialog open={entryOpen} onOpenChange={setEntryOpen} /> : null}
    </div>
  )
}
