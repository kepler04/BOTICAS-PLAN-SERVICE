import { ErrorMessage } from '@/components/common/ErrorMessage'
import { PageHeader } from '@/components/common/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMainBranch } from '@/features/branches/hooks/useMainBranch'
import { CashHistory } from '@/features/cash/components/CashHistory'
import { CashSessionPanel } from '@/features/cash/components/CashSessionPanel'
import { OpenCashCard } from '@/features/cash/components/OpenCashCard'
import { useOpenCashSession } from '@/features/cash/hooks/useCash'

export function CashPage() {
  const branch = useMainBranch()
  const session = useOpenCashSession()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Caja"
        description={branch.data ? `Turnos, ingresos y egresos · ${branch.data.name}` : 'Turnos, ingresos y egresos.'}
      />

      {branch.isError ? <ErrorMessage message={branch.error.message} /> : null}
      {branch.isSuccess && branch.data === null ? (
        <ErrorMessage
          title="Falta la sucursal principal"
          message="Tu botica no tiene una sucursal principal activa, así que no se puede usar la caja."
        />
      ) : null}
      {branch.isPending || (branch.data && session.isPending) ? <Skeleton className="h-40 w-full" /> : null}
      {session.isError ? <ErrorMessage message={session.error.message} /> : null}

      {branch.data && session.isSuccess ? (
        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">Caja actual</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>
          <TabsContent value="current" className="pt-2">
            {session.data ? <CashSessionPanel session={session.data} /> : <OpenCashCard />}
          </TabsContent>
          <TabsContent value="history" className="pt-2">
            <CashHistory />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}
