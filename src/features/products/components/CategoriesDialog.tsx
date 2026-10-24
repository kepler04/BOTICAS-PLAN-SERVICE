import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories, useCategoryMutations } from '@/features/products/hooks/useProducts'
import type { Category } from '@/features/products/types'

type CategoriesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoriesDialog({ open, onOpenChange }: CategoriesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorías</DialogTitle>
          <DialogDescription>
            Organiza tus productos. Si eliminas una categoría, sus productos quedan sin categoría.
          </DialogDescription>
        </DialogHeader>
        <CategoriesManager />
      </DialogContent>
    </Dialog>
  )
}

function CategoriesManager() {
  const categories = useCategories()
  const { create, rename, remove } = useCategoryMutations()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, success: string) {
    setError(null)
    try {
      await action()
      toast.success(success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operación.')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (newName.trim().length < 1) return
    await run(() => create.mutateAsync(newName), 'Categoría creada.')
    setNewName('')
  }

  async function handleRename(category: Category) {
    if (editingName.trim().length < 1) return
    await run(() => rename.mutateAsync({ id: category.id, name: editingName }), 'Categoría actualizada.')
    setEditingId(null)
  }

  async function handleRemove(category: Category) {
    await run(() => remove.mutateAsync(category.id), 'Categoría eliminada.')
    setConfirmingId(null)
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorMessage message={error} /> : null}

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva categoría"
          aria-label="Nombre de la nueva categoría"
          maxLength={80}
        />
        <Button type="submit" disabled={create.isPending || newName.trim() === ''}>
          <Plus aria-hidden="true" />
          Agregar
        </Button>
      </form>

      {categories.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {categories.isError ? <ErrorMessage message="No se pudieron cargar las categorías." /> : null}

      <ul className="divide-y rounded-lg border">
        {(categories.data ?? []).map((category) => (
          <li key={category.id} className="flex items-center gap-2 p-2">
            {editingId === category.id ? (
              <>
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  aria-label={`Nuevo nombre para ${category.name}`}
                  maxLength={80}
                  autoFocus
                />
                <Button size="icon-sm" variant="ghost" onClick={() => handleRename(category)} aria-label="Guardar nombre">
                  <Check aria-hidden="true" />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar edición">
                  <X aria-hidden="true" />
                </Button>
              </>
            ) : confirmingId === category.id ? (
              <>
                <span className="flex-1 text-sm">¿Eliminar “{category.name}”?</span>
                <Button size="sm" variant="destructive" onClick={() => handleRemove(category)} disabled={remove.isPending}>
                  Sí, eliminar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                  No
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm">{category.name}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(category.id)
                    setEditingName(category.name)
                  }}
                  aria-label={`Renombrar ${category.name}`}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setConfirmingId(category.id)} aria-label={`Eliminar ${category.name}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
