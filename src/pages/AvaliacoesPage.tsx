import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Avaliacao, Disciplina, TipoAvaliacao } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

interface AvaliacaoComDisciplina extends Avaliacao {
  disciplina?: { nome: string } | null
}

interface DisciplinaComTurma extends Disciplina {
  turma?: { nome: string } | null
}

const TIPOS: TipoAvaliacao[] = ['av1', 'av2', 'av3']

export default function AvaliacoesPage() {
  const { canWrite } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: avaliacoes = [], isLoading } = useList<AvaliacaoComDisciplina>(
    'avaliacoes',
    '*, disciplina:disciplinas(nome)',
    'id',
  )
  const { data: disciplinas = [] } = useList<DisciplinaComTurma>(
    'disciplinas',
    'id, nome, curso_id, turma_id, turma:turmas(nome)',
    'nome',
  )
  const { create, update, remove } = useEntityMutations('avaliacoes')

  const [tipo, setTipo] = useState<TipoAvaliacao>('av1')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [peso, setPeso] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const salvando = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (Number(peso) <= 0) {
      notify('O peso deve ser maior que zero.', 'error')
      return
    }
    const payload = { tipo, disciplina_id: Number(disciplinaId), peso: Number(peso) }
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload })
        notify('Avaliação atualizada.', 'success')
      } else {
        await create.mutateAsync(payload)
        notify('Avaliação criada.', 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  function editar(a: AvaliacaoComDisciplina) {
    setEditandoId(a.id)
    setTipo(a.tipo)
    setDisciplinaId(a.disciplina_id ? String(a.disciplina_id) : '')
    setPeso(a.peso != null ? String(a.peso) : '')
  }

  function cancelar() {
    setEditandoId(null)
    setTipo('av1')
    setDisciplinaId('')
    setPeso('')
  }

  async function excluir(a: AvaliacaoComDisciplina) {
    const ok = await confirm({ message: `Excluir avaliação #${a.id}?`, confirmText: 'Excluir' })
    if (!ok) return
    try {
      await remove.mutateAsync(a.id)
      notify('Avaliação excluída.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  const colunas: Column<AvaliacaoComDisciplina>[] = [
    {
      key: 'tipo',
      header: 'Tipo',
      accessor: (a) => a.tipo,
      render: (a) => <Badge color="brand">{a.tipo.toUpperCase()}</Badge>,
    },
    {
      key: 'disciplina',
      header: 'Disciplina',
      accessor: (a) => a.disciplina?.nome ?? '',
      render: (a) => a.disciplina?.nome ?? '—',
    },
    {
      key: 'peso',
      header: 'Peso',
      accessor: (a) => a.peso ?? 0,
      render: (a) => <span className="text-slate-500 dark:text-slate-400">{a.peso ?? '—'}</span>,
    },
    ...(canWrite
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (a: AvaliacaoComDisciplina) => (
              <div className="flex justify-end">
                <button
                  onClick={() => editar(a)}
                  className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => excluir(a)}
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
      <PageHeader title="Avaliações" description="Avaliações por disciplina, com peso para a média." />

      {canWrite && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap gap-2 p-4">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoAvaliacao)}
            className="input w-full sm:w-28"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={disciplinaId}
            onChange={(e) => setDisciplinaId(e.target.value)}
            className="input flex-1"
            required
          >
            <option value="">Selecione a matéria</option>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
                {d.turma?.nome ? ` · ${d.turma.nome}` : ''}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.1"
            min={0.1}
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            placeholder="Peso"
            className="input w-full sm:w-28"
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
        data={avaliacoes}
        loading={isLoading}
        rowKey={(a) => a.id}
        emptyMessage="Nenhuma avaliação cadastrada."
        searchPlaceholder="Buscar por disciplina ou tipo..."
        columns={colunas}
      />
    </div>
  )
}
