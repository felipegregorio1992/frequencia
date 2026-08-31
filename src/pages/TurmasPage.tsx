import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Turma, Usuario } from '../types/domain'
import { supabase } from '../lib/supabase'
import { useList, useEntityMutations, traduzErro } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

interface TurmaComProfs extends Turma {
  professores_turmas?: { professor_id: string; professor?: { matricula: string } | null }[]
}

export default function TurmasPage() {
  const { isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const qc = useQueryClient()

  const { data: turmas = [], isLoading } = useList<TurmaComProfs>(
    'turmas',
    '*, professores_turmas(professor_id, professor:usuarios(matricula))',
    'nome',
  )
  // Professores disponíveis para vincular (só admin enxerga todos).
  const { data: professores = [] } = useList<Usuario>('usuarios', 'id, matricula, tipo, primeiro_acesso, ativo', 'matricula')
  const { update, remove } = useEntityMutations('turmas')

  const [nome, setNome] = useState('')
  const [tempos, setTempos] = useState('')
  const [profsSelecionados, setProfsSelecionados] = useState<string[]>([])
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)

  const professoresLista = professores.filter((u) => u.tipo === 'PROFESSOR')

  // Sincroniza os vínculos professor-turma de uma turma com a seleção atual.
  async function sincronizarProfessores(turmaId: number, selecionados: string[]) {
    const { data: atuais } = await supabase
      .from('professores_turmas')
      .select('id, professor_id')
      .eq('turma_id', turmaId)
    const atuaisIds = (atuais ?? []).map((p) => p.professor_id)

    const paraAdicionar = selecionados.filter((id) => !atuaisIds.includes(id))
    const paraRemover = (atuais ?? []).filter((p) => !selecionados.includes(p.professor_id))

    if (paraAdicionar.length) {
      const { error } = await supabase
        .from('professores_turmas')
        .insert(paraAdicionar.map((professor_id) => ({ professor_id, turma_id: turmaId })))
      if (error) throw new Error(traduzErro(error.message))
    }
    for (const p of paraRemover) {
      const { error } = await supabase.from('professores_turmas').delete().eq('id', p.id)
      if (error) throw new Error(traduzErro(error.message))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const payload = { nome, quantidade_tempos: Number(tempos) }
      let turmaId = editandoId
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload })
      } else {
        const { data, error } = await supabase.from('turmas').insert(payload).select('id').single()
        if (error) throw new Error(traduzErro(error.message))
        turmaId = data.id
      }
      if (turmaId) await sincronizarProfessores(turmaId, profsSelecionados)
      await qc.invalidateQueries({ queryKey: ['turmas'] })
      notify(editandoId ? 'Turma atualizada.' : 'Turma criada.', 'success')
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  function editar(t: TurmaComProfs) {
    setEditandoId(t.id)
    setNome(t.nome)
    setTempos(String(t.quantidade_tempos))
    setProfsSelecionados((t.professores_turmas ?? []).map((p) => p.professor_id))
  }

  function cancelar() {
    setEditandoId(null)
    setNome('')
    setTempos('')
    setProfsSelecionados([])
  }

  function toggleProf(id: string) {
    setProfsSelecionados((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  async function excluir(t: TurmaComProfs) {
    const ok = await confirm({
      message: `Excluir a turma "${t.nome}"? Matérias, alunos vinculados, notas e frequências serão removidos.`,
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

  const colunas: Column<TurmaComProfs>[] = [
    { key: 'nome', header: 'Nome', accessor: (t) => t.nome },
    {
      key: 'professores',
      header: 'Professores',
      sortable: false,
      accessor: (t) => (t.professores_turmas ?? []).length,
      render: (t) => {
        const profs = t.professores_turmas ?? []
        if (!profs.length) return <span className="text-slate-400">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {profs.map((p) => (
              <Badge key={p.professor_id} color="brand">
                {p.professor?.matricula ?? '?'}
              </Badge>
            ))}
          </div>
        )
      },
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
            render: (t: TurmaComProfs) => (
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
      <PageHeader title="Turmas" description="Crie turmas e vincule os professores responsáveis." />

      {isAdmin && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
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
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Professores da turma
            </label>
            {professoresLista.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum professor cadastrado ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {professoresLista.map((p) => {
                  const ativo = profsSelecionados.includes(p.id)
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleProf(p.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        ativo
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {p.matricula}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={salvando} className="btn-primary">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editandoId ? 'Salvar' : 'Adicionar'}
            </button>
            {editandoId && (
              <button type="button" onClick={cancelar} className="btn-ghost">
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      <DataTable
        data={turmas}
        loading={isLoading}
        rowKey={(t) => t.id}
        emptyMessage="Nenhuma turma cadastrada."
        searchPlaceholder="Buscar turma..."
        columns={colunas}
      />
    </div>
  )
}
