import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Curso, Disciplina } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

interface DisciplinaComCurso extends Disciplina {
  curso?: { nome: string } | null
}

export default function DisciplinasPage() {
  const { isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: disciplinas = [], isLoading } = useList<DisciplinaComCurso>(
    'disciplinas',
    '*, curso:cursos(nome)',
    'nome',
  )
  const { data: cursos = [] } = useList<Curso>('cursos', '*', 'nome')
  const { create, update, remove } = useEntityMutations('disciplinas')

  const [nome, setNome] = useState('')
  const [cursoId, setCursoId] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const salvando = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { nome, curso_id: Number(cursoId) }
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload })
        notify('Disciplina atualizada.', 'success')
      } else {
        await create.mutateAsync(payload)
        notify('Disciplina criada.', 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  function editar(d: DisciplinaComCurso) {
    setEditandoId(d.id)
    setNome(d.nome)
    setCursoId(String(d.curso_id))
  }

  function cancelar() {
    setEditandoId(null)
    setNome('')
    setCursoId('')
  }

  async function excluir(d: DisciplinaComCurso) {
    const ok = await confirm({
      message: `Excluir a disciplina "${d.nome}"?`,
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(d.id)
      notify('Disciplina excluída.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  const colunas: Column<DisciplinaComCurso>[] = [
    { key: 'nome', header: 'Nome', accessor: (d) => d.nome },
    {
      key: 'curso',
      header: 'Curso',
      accessor: (d) => d.curso?.nome ?? '',
      render: (d) => <span className="text-slate-500 dark:text-slate-400">{d.curso?.nome ?? '—'}</span>,
    },
    ...(isAdmin
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (d: DisciplinaComCurso) => (
              <div className="flex justify-end">
                <button
                  onClick={() => editar(d)}
                  className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => excluir(d)}
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
      <PageHeader title="Disciplinas" description="Disciplinas vinculadas a cada curso." />

      {isAdmin && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap gap-2 p-4">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da disciplina"
            className="input flex-1"
            required
          />
          <select
            value={cursoId}
            onChange={(e) => setCursoId(e.target.value)}
            className="input w-full sm:w-56"
            required
          >
            <option value="">Selecione o curso</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
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
        data={disciplinas}
        loading={isLoading}
        rowKey={(d) => d.id}
        emptyMessage="Nenhuma disciplina cadastrada."
        searchPlaceholder="Buscar disciplina ou curso..."
        columns={colunas}
      />
    </div>
  )
}
