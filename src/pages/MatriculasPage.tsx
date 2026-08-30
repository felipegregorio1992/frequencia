import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Matricula } from '../types/domain'
import { useList, useEntityMutations } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

export default function MatriculasPage() {
  const { isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { data: matriculas = [], isLoading } = useList<Matricula>('matriculas', '*', 'codigo')
  const { create, update, remove } = useEntityMutations('matriculas')

  const [codigo, setCodigo] = useState('')
  const [nomeAluno, setNomeAluno] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const salvando = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { codigo, nome_aluno: nomeAluno, ativo }
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload })
        notify('Matrícula atualizada.', 'success')
      } else {
        await create.mutateAsync(payload)
        notify('Matrícula criada.', 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    }
  }

  function editar(m: Matricula) {
    setEditandoId(m.id)
    setCodigo(m.codigo)
    setNomeAluno(m.nome_aluno)
    setAtivo(m.ativo)
  }

  function cancelar() {
    setEditandoId(null)
    setCodigo('')
    setNomeAluno('')
    setAtivo(true)
  }

  async function excluir(m: Matricula) {
    const ok = await confirm({
      message: `Excluir a matrícula "${m.codigo}" (${m.nome_aluno})?`,
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(m.id)
      notify('Matrícula excluída.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  const colunas: Column<Matricula>[] = [
    { key: 'codigo', header: 'Código', accessor: (m) => m.codigo },
    { key: 'nome_aluno', header: 'Aluno', accessor: (m) => m.nome_aluno },
    {
      key: 'ativo',
      header: 'Status',
      accessor: (m) => (m.ativo ? 'Ativo' : 'Inativo'),
      render: (m) => <Badge color={m.ativo ? 'green' : 'slate'}>{m.ativo ? 'Ativo' : 'Inativo'}</Badge>,
    },
    ...(isAdmin
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (m: Matricula) => (
              <div className="flex justify-end">
                <button
                  onClick={() => editar(m)}
                  className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => excluir(m)}
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
      <PageHeader title="Matrículas" description="Alunos matriculados (código e nome)." />

      {isAdmin && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap items-center gap-2 p-4">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código (ex: MAT-0001)"
            className="input w-full sm:w-48"
            required
          />
          <input
            value={nomeAluno}
            onChange={(e) => setNomeAluno(e.target.value)}
            placeholder="Nome do aluno"
            className="input flex-1"
            required
          />
          <label className="flex items-center gap-2 px-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo
          </label>
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
        data={matriculas}
        loading={isLoading}
        rowKey={(m) => m.id}
        emptyMessage="Nenhuma matrícula cadastrada."
        searchPlaceholder="Buscar por código ou nome..."
        columns={colunas}
      />
    </div>
  )
}
