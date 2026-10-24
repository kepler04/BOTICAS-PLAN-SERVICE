import { useState } from 'react'
import { PackagePlus, ReceiptText } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PurchaseDetailDialog } from '@/features/purchases/components/PurchaseDetailDialog'
import { PurchaseDialog } from '@/features/purchases/components/PurchaseDialog'
import { SuppliersTab } from '@/features/purchases/components/SuppliersTab'
import { usePurchaseList } from '@/features/purchases/hooks/usePurchases'
import { DOC_TYPE_LABELS } from '@/features/purchases/lib/purchase'
import { PURCHASES_PAGE_SIZE } from '@/features/purchases/services/purchasesService'
import { formatDate, formatPEN } from '@/lib/format'

export function PurchasesPage() {
  const [registerOpen, setRegisterOpen] = useState(false)
  return (
    <div className="space-y-4">
      <PageHeader
        title="Compras"
        description="Facturas de tus proveedores: el stock entra con su lote, vencimiento y costo."
        actions={
          <Button onClick={() => setRegisterOpen(true)}>
            <PackagePlus aria-hidden="true" />
            Registrar compra
          </Button>
        }
      />
      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Compras</TabsTrigger>
          <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="pt-2">
          <PurchasesList />
        </TabsContent>
        <TabsContent value="suppliers" className="pt-2">
          <SuppliersTab />
        </TabsContent>
      </Tabs>
      <PurchaseDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </div>
  )
}

function PurchasesList() {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const purchases = usePurchaseList(page)
  const rows = purchases.data?.rows ?? []

  return (
    <div className="space-y-3">
      {purchases.isError ? <ErrorMessage message={purchases.error.message} /> : null}
      {purchases.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {purchases.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Aún no registras compras"
          description="Crea tu proveedor y registra su factura con “Registrar compra”."
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emisión</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="hidden md:table-cell">Registró</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.issue_date)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">
                      {DOC_TYPE_LABELS[p.doc_type]} {p.doc_number}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.suppliers?.name ?? '—'}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.profiles?.full_name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPEN(p.total ?? p.subtotal + p.igv)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(p.id)} aria-label={`Ver ${DOC_TYPE_LABELS[p.doc_type]} ${p.doc_number}`}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <Pagination page={page} pageSize={PURCHASES_PAGE_SIZE} total={purchases.data?.total ?? 0} onPageChange={setPage} />
      <PurchaseDetailDialog purchaseId={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  )
}
