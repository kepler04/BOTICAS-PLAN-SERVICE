import { PageHeader } from '@/components/common/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PosView } from '@/features/sales/components/PosView'
import { SalesHistory } from '@/features/sales/components/SalesHistory'

export function SalesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Ventas" description="Cobra rápido y revisa lo vendido. Comprobantes internos de prueba." />
      <Tabs defaultValue="pos">
        <TabsList>
          <TabsTrigger value="pos">Nueva venta</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="pt-2">
          <PosView />
        </TabsContent>
        <TabsContent value="history" className="pt-2">
          <SalesHistory />
        </TabsContent>
      </Tabs>
    </div>
  )
}
