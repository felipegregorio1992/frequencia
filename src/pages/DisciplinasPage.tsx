import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Disciplina, Turma } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

interface DisciplinaComTurma extends Disciplina {
  turma?: { nome: string } | null
}

export default function DisciplinasPage() {
  const { canWrite } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: disciplinas = [], isLoading } = useList<DisciplinaComTurma>(
    'disciplinas',
    '*, turma:turmas(nome)',
    'nome',
  )
  // RLS já limita as turmas às do professor logado (admin vê todas).
  const { data: turmas = [] } = useList<Turma>('turmas', 'id, nome, quantidade_tempos, curso_id', 'nome')
  const { create, update, remove } = useEntityMutations('disciplinas')

  const [nome, setNome] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const salvando = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!turmaId) {
      notify('Selecione a turma.', 'error')
      return
    }
    const payload = { nome, turma_id: Number(turmaId) }
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload })
        notify('Matéria atualizada.', 'success')
      } else {
        await create.mutateAsync(payload)
        notify('Matéria criada.', 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  function editar(d: DisciplinaComTurma) {
    setEditandoId(d.id)
    setNome(d.nome)
    setTurmaId(d.turma_id ? String(d.turma_id) : '')
  }

  function cancelar() {
    setEditandoId(null)
    setNome('')
    setTurmaId('')
  }

  async function excluir(d: DisciplinaComTurma) {
    const ok = await confirm({
      message: `Excluir a matéria "${d.nome}"? Avaliações e notas vinculadas serão removidas.`,
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(d.id)
      notify('Matéria excluída.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  const colunas: Column<DisciplinaComTurma>[] = [
    { key: 'nome', header: 'Matéria', accessor: (d) => d.nome },
    {
      key: 'turma',
      header: 'Turma',
      accessor: (d) => d.turma?.nome ?? '',
      render: (d) => <span className="text-slate-500 dark:text-slate-400">{d.turma?.nome ?? '—'}</span>,
    },
    ...(canWrite
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (d: DisciplinaComTurma) => (
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
      <PageHeader title="Matérias" description="Matérias de cada turma. Você gerencia as matérias das suas turmas." />

      {canWrite && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap gap-2 p-4">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da matéria"
            className="input flex-1"
            required
          />
          <select
            value={turmaId}
            onChange={(e) => setTurmaId(e.target.value)}
            className="input w-full sm:w-56"
            required
          >
            <option value="">Selecione a turma</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
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
        emptyMessage="Nenhuma matéria cadastrada."
        searchPlaceholder="Buscar matéria ou turma..."
        columns={colunas}
      />
    </div>
  )
}
