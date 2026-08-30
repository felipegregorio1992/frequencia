import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Curso, Turma } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

interface TurmaComCurso extends Turma {
  curso?: { nome: string } | null
}

export default function TurmasPage() {
  const { isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: turmas = [], isLoading } = useList<TurmaComCurso>(
    'turmas',
    '*, curso:cursos(nome)',
    'nome',
  )
  const { data: cursos = [] } = useList<Curso>('cursos', '*', 'nome')
  const { create, update, remove } = useEntityMutations('turmas')

  const [nome, setNome] = useState('')
  const [tempos, setTempos] = useState('')
  const [cursoId, setCursoId] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const salvando = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { nome, quantidade_tempos: Number(tempos), curso_id: Number(cursoId) }
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload })
        notify('Turma atualizada.', 'success')
      } else {
        await create.mutateAsync(payload)
        notify('Turma criada.', 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  function editar(t: TurmaComCurso) {
    setEditandoId(t.id)
    setNome(t.nome)
    setTempos(String(t.quantidade_tempos))
    setCursoId(String(t.curso_id))
  }

  function cancelar() {
    setEditandoId(null)
    setNome('')
    setTempos('')
    setCursoId('')
  }

  async function excluir(t: TurmaComCurso) {
    const ok = await confirm({
      message: `Excluir a turma "${t.nome}"? Notas e frequências vinculadas serão removidas.`,
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(t.id)
      notify('Turma excluída.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  const colunas: Column<TurmaComCurso>[] = [
    { key: 'nome', header: 'Nome', accessor: (t) => t.nome },
    {
      key: 'curso',
      header: 'Curso',
      accessor: (t) => t.curso?.nome ?? '',
      render: (t) => <span className="text-slate-500 dark:text-slate-400">{t.curso?.nome ?? '—'}</span>,
    },
    {
      key: 'quantidade_tempos',
      header: 'Tempos',
      accessor: (t) => t.quantidade_tempos,
      render: (t) => <span className="text-slate-500 dark:text-slate-400">{t.quantidade_tempos}</span>,
    },
    ...(isAdmin
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (t: TurmaComCurso) => (
              <div className="flex justify-end">
                <button
                  onClick={() => editar(t)}
                  className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => excluir(t)}
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
      <PageHeader title="Turmas" description="Turmas vinculadas a cada curso." />

      {isAdmin && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap gap-2 p-4">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da turma"
            className="input flex-1"
            required
          />
          <input
            type="number"
            min={1}
            value={tempos}
            onChange={(e) => setTempos(e.target.value)}
            placeholder="Tempos"
            className="input w-full sm:w-28"
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
        data={turmas}
        loading={isLoading}
        rowKey={(t) => t.id}
        emptyMessage="Nenhuma turma cadastrada."
        searchPlaceholder="Buscar turma ou curso..."
        columns={colunas}
      />
    </div>
  )
}
