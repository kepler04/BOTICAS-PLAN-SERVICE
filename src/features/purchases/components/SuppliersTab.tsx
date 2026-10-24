import { useState } from 'react'
import { Pencil, Plus, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SupplierDialog } from '@/features/purchases/components/SupplierDialog'
import { useSaveSupplier, useSuppliers } from '@/features/purchases/hooks/usePurchases'
import type { Supplier } from '@/features/purchases/services/purchasesService'

export function SuppliersTab() {
  const suppliers = useSuppliers()
  const save = useSaveSupplier()
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [open, setOpen] = useState(false)

  function toggle(s: Supplier) {
    save.mutate(
      { id: s.id, values: { name: s.name, ruc: s.ruc, phone: s.phone, email: s.email, active: !s.active } },
      {
        onSuccess: () => toast.success(s.active ? `${s.name} fue desactivado.` : `${s.name} fue activado.`),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus aria-hidden="true" />
          Nuevo proveedor
        </Button>
      </div>
      {suppliers.isError ? <ErrorMessage message={suppliers.error.message} /> : null}
      {suppliers.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {suppliers.isSuccess && suppliers.data.length === 0 ? (
        <EmptyState icon={Truck} title="Aún no tienes proveedores" description="Crea la droguería o el laboratorio al que le compras." />
      ) : null}
      {suppliers.isSuccess && suppliers.data.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead className="hidden sm:table-cell">Contacto</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.data.map((s) => (
                <TableRow key={s.id} className={s.active ? undefined : 'opacity-60'}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">
                      {s.name} {!s.active ? <Badge variant="secondary">Inactivo</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.ruc ? `RUC ${s.ruc}` : 'Sin RUC'}</div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal text-sm sm:table-cell">
                    {[s.phone, s.email].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Editar ${s.name}`}
                        onClick={() => {
                          setEditing(s)
                          setOpen(true)
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => toggle(s)}>
                        {s.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <SupplierDialog open={open} onOpenChange={setOpen} supplier={editing} />
    </div>
  )
}
