import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import type { Matricula, MatriculaTurma, Turma } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

interface MatriculaTurmaDetalhe extends MatriculaTurma {
  matricula?: { codigo: string; nome_aluno: string } | null
  turma?: { nome: string } | null
}

export default function MatriculasTurmasPage() {
  const { isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: itens = [], isLoading } = useList<MatriculaTurmaDetalhe>(
    'matriculas_turmas',
    '*, matricula:matriculas(codigo, nome_aluno), turma:turmas(nome)',
    'id',
  )
  const { data: matriculas = [] } = useList<Matricula>('matriculas', '*', 'codigo')
  const { data: turmas = [] } = useList<Turma>('turmas', '*', 'nome')
  const { create, remove } = useEntityMutations('matriculas_turmas')

  const [matriculaId, setMatriculaId] = useState('')
  const [turmaId, setTurmaId] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await create.mutateAsync({ matricula_id: Number(matriculaId), turma_id: Number(turmaId) })
      notify('Aluno adicionado à turma.', 'success')
      setMatriculaId('')
      setTurmaId('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  async function excluir(i: MatriculaTurmaDetalhe) {
    const ok = await confirm({ message: 'Remover este aluno da turma?', confirmText: 'Remover' })
    if (!ok) return
    try {
      await remove.mutateAsync(i.id)
      notify('Aluno removido da turma.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao remover.', 'error')
    }
  }

  const colunas: Column<MatriculaTurmaDetalhe>[] = [
    {
      key: 'matricula',
      header: 'Aluno',
      accessor: (i) => `${i.matricula?.codigo ?? ''} ${i.matricula?.nome_aluno ?? ''}`,
      render: (i) => (
        <>
          {i.matricula?.codigo ?? '—'}{' '}
          <span className="text-slate-400">· {i.matricula?.nome_aluno ?? ''}</span>
        </>
      ),
    },
    {
      key: 'turma',
      header: 'Turma',
      accessor: (i) => i.turma?.nome ?? '',
      render: (i) => <span className="text-slate-500 dark:text-slate-400">{i.turma?.nome ?? '—'}</span>,
    },
    ...(isAdmin
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (i: MatriculaTurmaDetalhe) => (
              <div className="flex justify-end">
                <button
                  onClick={() => excluir(i)}
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
      <PageHeader
        title="Alunos / Turmas"
        description="Associação entre uma matrícula e uma turma."
      />

      {isAdmin && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap gap-2 p-4">
          <select
            value={matriculaId}
            onChange={(e) => setMatriculaId(e.target.value)}
            className="input flex-1"
            required
          >
            <option value="">Selecione o aluno</option>
            {matriculas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo} — {m.nome_aluno}
              </option>
            ))}
          </select>
          <select
            value={turmaId}
            onChange={(e) => setTurmaId(e.target.value)}
            className="input flex-1"
            required
          >
            <option value="">Selecione a turma</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </button>
        </form>
      )}

      <DataTable
        data={itens}
        loading={isLoading}
        rowKey={(i) => i.id}
        emptyMessage="Nenhuma associação cadastrada."
        searchPlaceholder="Buscar por matrícula ou turma..."
        columns={colunas}
      />
    </div>
  )
}
