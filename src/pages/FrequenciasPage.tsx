import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X, Loader2, CalendarCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useList, traduzErro } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { PageHeader, Spinner, EmptyState, Badge } from '../ui/primitives'
import type { Turma } from '../types/domain'

interface AlunoDaTurma {
  matricula_turma_id: number
  codigo: string
  nome: string
}

interface FreqDoDia {
  id: number
  matricula_turma_id: number
  presente: boolean
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

// Busca os alunos da turma (via matriculas_turmas) e a frequência já lançada na data.
async function carregarDiario(turmaId: number, data: string) {
  const { data: mts, error: e1 } = await supabase
    .from('matriculas_turmas')
    .select('id, matricula:matriculas(codigo, nome_aluno)')
    .eq('turma_id', turmaId)
  if (e1) throw new Error(traduzErro(e1.message))

  const alunos: AlunoDaTurma[] = (mts ?? []).map((m: any) => ({
    matricula_turma_id: m.id,
    codigo: m.matricula?.codigo ?? '—',
    nome: m.matricula?.nome_aluno ?? '',
  }))
  alunos.sort((a, b) => a.codigo.localeCompare(b.codigo))

  const ids = alunos.map((a) => a.matricula_turma_id)
  let freq: FreqDoDia[] = []
  if (ids.length > 0) {
    const { data: fr, error: e2 } = await supabase
      .from('frequencias')
      .select('id, matricula_turma_id, presente')
      .eq('data', data)
      .in('matricula_turma_id', ids)
    if (e2) throw new Error(traduzErro(e2.message))
    freq = (fr ?? []) as FreqDoDia[]
  }

  return { alunos, freq }
}

export default function FrequenciasPage() {
  const { canWrite } = useAuth()
  const { notify } = useToast()
  const qc = useQueryClient()

  const { data: turmas = [] } = useList<Turma>('turmas', '*', 'nome')
  const [turmaId, setTurmaId] = useState('')
  const [data, setData] = useState(hoje())
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const habilitado = Boolean(turmaId)

  const { data: diario, isLoading, isFetching } = useQuery({
    queryKey: ['diario', turmaId, data],
    queryFn: () => carregarDiario(Number(turmaId), data),
    enabled: habilitado,
  })

  // mapa matricula_turma_id -> presença (undefined = ainda não lançado)
  const presencas = useMemo(() => {
    const m = new Map<number, boolean>()
    for (const f of diario?.freq ?? []) m.set(f.matricula_turma_id, f.presente)
    return m
  }, [diario])

  async function marcar(mtId: number, presente: boolean) {
    if (!canWrite) return
    setSalvandoId(mtId)
    try {
      // upsert usando a restrição única (matricula_turma_id, data)
      const { error } = await supabase
        .from('frequencias')
        .upsert(
          { matricula_turma_id: mtId, data, presente },
          { onConflict: 'matricula_turma_id,data' },
        )
      if (error) throw new Error(traduzErro(error.message))
      await qc.invalidateQueries({ queryKey: ['diario', turmaId, data] })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    } finally {
      setSalvandoId(null)
    }
  }

  const alunos = diario?.alunos ?? []
  const totalPresentes = alunos.filter((a) => presencas.get(a.matricula_turma_id) === true).length
  const totalLancados = alunos.filter((a) => presencas.has(a.matricula_turma_id)).length

  return (
    <div>
      <PageHeader
        title="Frequências"
        description="Selecione a turma e a data, depois clique em cada aluno para marcar presença ou falta."
      />

      <div className="card mb-6 flex flex-wrap items-center gap-2 p-4">
        <select
          value={turmaId}
          onChange={(e) => setTurmaId(e.target.value)}
          className="input flex-1"
        >
          <option value="">Selecione a turma</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="input w-full sm:w-44"
        />
        {habilitado && alunos.length > 0 && (
          <div className="flex items-center gap-2 px-2 text-sm text-slate-500 dark:text-slate-400">
            <Badge color="green">{totalPresentes} presentes</Badge>
            <Badge color="slate">{totalLancados}/{alunos.length} lançados</Badge>
          </div>
        )}
      </div>

      {!habilitado ? (
        <div className="card">
          <EmptyState message="Selecione uma turma para ver a lista de alunos." />
        </div>
      ) : isLoading ? (
        <div className="card">
          <Spinner />
        </div>
      ) : alunos.length === 0 ? (
        <div className="card">
          <EmptyState message="Nenhum aluno associado a esta turma." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {alunos.map((a) => {
            const estado = presencas.get(a.matricula_turma_id)
            const salvando = salvandoId === a.matricula_turma_id
            const borda =
              estado === true
                ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40'
                : estado === false
                  ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
                  : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
            return (
              <div
                key={a.matricula_turma_id}
                className={`flex items-center justify-between rounded-xl border p-4 transition ${borda}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {a.codigo} <span className="font-normal text-slate-400">· {a.nome}</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs">
                    {estado === undefined ? (
                      <span className="text-slate-400">Não lançado</span>
                    ) : estado ? (
                      <span className="text-green-600 dark:text-green-400">Presente</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">Falta</span>
                    )}
                  </div>
                </div>

                {canWrite && (
                  <div className="flex items-center gap-1">
                    {salvando ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    ) : (
                      <>
                        <button
                          onClick={() => marcar(a.matricula_turma_id, true)}
                          title="Marcar presente"
                          className={`rounded-lg p-2 transition ${
                            estado === true
                              ? 'bg-green-600 text-white'
                              : 'text-slate-400 hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-950'
                          }`}
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => marcar(a.matricula_turma_id, false)}
                          title="Marcar falta"
                          className={`rounded-lg p-2 transition ${
                            estado === false
                              ? 'bg-red-600 text-white'
                              : 'text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950'
                          }`}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {isFetching && (
            <div className="col-span-full flex justify-center py-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
