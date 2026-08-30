import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Curso } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

export default function CursosPage() {
  const { isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: cursos = [], isLoading } = useList<Curso>('cursos', '*', 'nome')
  const { create, update, remove } = useEntityMutations('cursos')

  const [nome, setNome] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const salvando = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload: { nome } })
        notify('Curso atualizado.', 'success')
      } else {
        await create.mutateAsync({ nome })
        notify('Curso criado.', 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  function editar(c: Curso) {
    setEditandoId(c.id)
    setNome(c.nome)
  }

  function cancelar() {
    setEditandoId(null)
    setNome('')
  }

  async function excluir(c: Curso) {
    const ok = await confirm({
      message: `Excluir o curso "${c.nome}"? Disciplinas e turmas vinculadas também serão removidas.`,
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(c.id)
      notify('Curso excluído.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  const colunas: Column<Curso>[] = [
    { key: 'nome', header: 'Nome', accessor: (c) => c.nome },
    ...(isAdmin
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (c: Curso) => (
              <div className="flex justify-end">
                <button
                  onClick={() => editar(c)}
                  className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => excluir(c)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader title="Cursos" description="Cursos oferecidos pela instituição." />

      {isAdmin && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap gap-2 p-4">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do curso"
            className="input flex-1"
            required
          />
          <button type="submit" disabled={salvando} className="btn-primary">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editandoId ? 'Salvar' : 'Adicionar'}
          </button>
          {editandoId && (
            <button type="button" onClick={cancelar} className="btn-ghost">
              Cancelar
            </button>
          )}
        </form>
      )}

      <DataTable
        data={cursos}
        loading={isLoading}
        rowKey={(c) => c.id}
        emptyMessage="Nenhum curso cadastrado."
        searchPlaceholder="Buscar curso..."
        columns={colunas}
      />
    </div>
  )
}
