import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, PenLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useList, traduzErro } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { PageHeader, Spinner, EmptyState, Badge } from '../ui/primitives'
import type { Turma } from '../types/domain'

interface AvalOption {
  id: number
  tipo: string
  disciplina?: { id: number; nome: string; turma_id: number | null } | null
}

interface AlunoNota {
  matricula_turma_id: number
  codigo: string
  nome: string
  notaId: number | null
  valor: number | null
}

// Carrega os alunos da turma e as notas já lançadas para a avaliação escolhida.
async function carregarLancamento(turmaId: number, avaliacaoId: number) {
  const { data: mts, error: e1 } = await supabase
    .from('matriculas_turmas')
    .select('id, matricula:matriculas(codigo, nome_aluno)')
    .eq('turma_id', turmaId)
  if (e1) throw new Error(traduzErro(e1.message))

  const alunos = (mts ?? []).map((m: any) => ({
    matricula_turma_id: m.id as number,
    codigo: m.matricula?.codigo ?? '—',
    nome: m.matricula?.nome_aluno ?? '',
  }))
  alunos.sort((a, b) => a.codigo.localeCompare(b.codigo))

  const ids = alunos.map((a) => a.matricula_turma_id)
  let notas: { id: number; matricula_turma_id: number; valor: number }[] = []
  if (ids.length > 0) {
    const { data: nt, error: e2 } = await supabase
      .from('notas')
      .select('id, matricula_turma_id, valor')
      .eq('avaliacao_id', avaliacaoId)
      .in('matricula_turma_id', ids)
    if (e2) throw new Error(traduzErro(e2.message))
    notas = (nt ?? []) as typeof notas
  }

  const mapa = new Map(notas.map((n) => [n.matricula_turma_id, n]))
  const linhas: AlunoNota[] = alunos.map((a) => {
    const n = mapa.get(a.matricula_turma_id)
    return {
      matricula_turma_id: a.matricula_turma_id,
      codigo: a.codigo,
      nome: a.nome,
      notaId: n?.id ?? null,
      valor: n?.valor ?? null,
    }
  })
  return linhas
}

export default function NotasPage() {
  const { canWrite } = useAuth()
  const { notify } = useToast()
  const qc = useQueryClient()

  const { data: turmas = [] } = useList<Turma>('turmas', 'id, nome, quantidade_tempos, curso_id', 'nome')
  const { data: avaliacoes = [] } = useList<AvalOption>(
    'avaliacoes',
    'id, tipo, disciplina:disciplinas(id, nome, turma_id)',
    'id',
  )

  const [turmaId, setTurmaId] = useState('')
  const [avaliacaoId, setAvaliacaoId] = useState('')
  // valores em edição (string) por matricula_turma_id
  const [rascunho, setRascunho] = useState<Record<number, string>>({})
  const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [salvandoTodos, setSalvandoTodos] = useState(false)

  // Avaliações compatíveis = as das matérias da turma selecionada.
  const avaliacoesCompativeis = useMemo(() => {
    if (!turmaId) return []
    return avaliacoes.filter((a) => String(a.disciplina?.turma_id ?? '') === turmaId)
  }, [avaliacoes, turmaId])

  const habilitado = Boolean(turmaId && avaliacaoId)

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ['lancamento-notas', turmaId, avaliacaoId],
    queryFn: () => carregarLancamento(Number(turmaId), Number(avaliacaoId)),
    enabled: habilitado,
  })

  function valorAtual(l: AlunoNota): string {
    if (l.matricula_turma_id in rascunho) return rascunho[l.matricula_turma_id]
    return l.valor != null ? String(l.valor) : ''
  }

  function validar(v: string): number | null {
    if (v.trim() === '') return null
    const n = Number(v.replace(',', '.'))
    if (Number.isNaN(n) || n < 0 || n > 10) return NaN
    return n
  }

  async function salvarUm(l: AlunoNota) {
    const v = validar(valorAtual(l))
    if (v === null) {
      notify('Informe uma nota para salvar.', 'info')
      return
    }
    if (Number.isNaN(v)) {
      notify('A nota deve estar entre 0 e 10.', 'error')
      return
    }
    setSalvandoId(l.matricula_turma_id)
    try {
      const { error } = await supabase.from('notas').upsert(
        { matricula_turma_id: l.matricula_turma_id, avaliacao_id: Number(avaliacaoId), valor: v },
        { onConflict: 'matricula_turma_id,avaliacao_id' },
      )
      if (error) throw new Error(traduzErro(error.message))
      setRascunho((r) => {
        const novo = { ...r }
        delete novo[l.matricula_turma_id]
        return novo
      })
      await qc.invalidateQueries({ queryKey: ['lancamento-notas', turmaId, avaliacaoId] })
      notify(`Nota de ${l.codigo} salva.`, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    } finally {
      setSalvandoId(null)
    }
  }

  async function salvarTodos() {
    // salva apenas os que foram alterados e são válidos
    const alterados = linhas.filter((l) => l.matricula_turma_id in rascunho)
    const payloads: { matricula_turma_id: number; avaliacao_id: number; valor: number }[] = []
    for (const l of alterados) {
      const v = validar(valorAtual(l))
      if (v === null) continue
      if (Number.isNaN(v)) {
        notify(`Nota inválida para ${l.codigo} (use 0 a 10).`, 'error')
        return
      }
      payloads.push({ matricula_turma_id: l.matricula_turma_id, avaliacao_id: Number(avaliacaoId), valor: v })
    }
    if (payloads.length === 0) {
      notify('Nenhuma nota alterada para salvar.', 'info')
      return
    }
    setSalvandoTodos(true)
    try {
      const { error } = await supabase
        .from('notas')
        .upsert(payloads, { onConflict: 'matricula_turma_id,avaliacao_id' })
      if (error) throw new Error(traduzErro(error.message))
      setRascunho({})
      await qc.invalidateQueries({ queryKey: ['lancamento-notas', turmaId, avaliacaoId] })
      notify(`${payloads.length} nota(s) salva(s).`, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    } finally {
      setSalvandoTodos(false)
    }
  }

  const alteracoesPendentes = linhas.some((l) => l.matricula_turma_id in rascunho)

  return (
    <div>
      <PageHeader
        title="Notas"
        description="Selecione a turma e a avaliação, depois lance a nota de cada aluno."
      />

      <div className="card mb-6 flex flex-wrap items-center gap-2 p-4">
        <select
          value={turmaId}
          onChange={(e) => {
            setTurmaId(e.target.value)
            setAvaliacaoId('')
            setRascunho({})
          }}
          className="input flex-1"
        >
          <option value="">Selecione a turma</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <select
          value={avaliacaoId}
          onChange={(e) => {
            setAvaliacaoId(e.target.value)
            setRascunho({})
          }}
          disabled={!turmaId}
          className="input flex-1 disabled:opacity-60"
        >
          <option value="">
            {turmaId ? 'Selecione a avaliação' : 'Escolha a turma primeiro'}
          </option>
          {avaliacoesCompativeis.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tipo.toUpperCase()} · {a.disciplina?.nome ?? '—'}
            </option>
          ))}
        </select>
        {canWrite && habilitado && linhas.length > 0 && (
          <button onClick={salvarTodos} disabled={salvandoTodos || !alteracoesPendentes} className="btn-primary">
            {salvandoTodos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar todos
          </button>
        )}
      </div>

      {!habilitado ? (
        <div className="card">
          <EmptyState message="Selecione a turma e a avaliação para lançar as notas." />
        </div>
      ) : isLoading ? (
        <div className="card">
          <Spinner />
        </div>
      ) : linhas.length === 0 ? (
        <div className="card">
          <EmptyState message="Nenhum aluno associado a esta turma." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Aluno</th>
                <th className="px-4 py-3 font-medium">Nota atual</th>
                <th className="px-4 py-3 font-medium">Lançar nota</th>
                {canWrite && <th className="px-4 py-3 text-right font-medium">Ação</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const editado = l.matricula_turma_id in rascunho
                return (
                  <tr key={l.matricula_turma_id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PenLine className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {l.codigo} <span className="font-normal text-slate-400">· {l.nome}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {l.valor != null ? (
                        <Badge color={l.valor >= 6 ? 'green' : 'red'}>{l.valor.toFixed(1)}</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        disabled={!canWrite}
                        value={valorAtual(l)}
                        onChange={(e) =>
                          setRascunho((r) => ({ ...r, [l.matricula_turma_id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') salvarUm(l)
                        }}
                        placeholder="0.0"
                        className={`input w-24 ${editado ? 'border-brand-500 ring-2 ring-brand-500/20' : ''}`}
                      />
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => salvarUm(l)}
                          disabled={salvandoId === l.matricula_turma_id || !editado}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-brand-950"
                        >
                          {salvandoId === l.matricula_turma_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Salvar
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
