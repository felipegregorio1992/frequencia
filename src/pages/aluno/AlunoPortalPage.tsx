import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, LogOut, Moon, Sun } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../ui/ThemeContext'
import { Spinner, EmptyState, Badge } from '../../ui/primitives'

const FREQUENCIA_MINIMA = 75

async function carregarMeusDados(usuarioId: string) {
  const { data: matricula } = await supabase
    .from('matriculas')
    .select('id, codigo, nome_aluno')
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (!matricula) return { semMatricula: true as const }

  const { data: mts } = await supabase
    .from('matriculas_turmas')
    .select('id, turma:turmas(nome)')
    .eq('matricula_id', matricula.id)
  const mtIds = (mts ?? []).map((m: any) => m.id)

  let notas: any[] = []
  let freqs: any[] = []
  if (mtIds.length > 0) {
    const [n, f] = await Promise.all([
      supabase
        .from('notas')
        .select('valor, avaliacao:avaliacoes(tipo, peso, disciplina:disciplinas(nome))')
        .in('matricula_turma_id', mtIds),
      supabase.from('frequencias').select('data, presente').in('matricula_turma_id', mtIds),
    ])
    notas = n.data ?? []
    freqs = f.data ?? []
  }

  // notas por disciplina + média ponderada
  const porDisc = new Map<string, { itens: { tipo: string; valor: number }[]; somaPeso: number; somaVP: number }>()
  for (const nt of notas) {
    const disc = nt.avaliacao?.disciplina?.nome ?? '—'
    const peso = Number(nt.avaliacao?.peso ?? 1)
    const g = porDisc.get(disc) ?? { itens: [], somaPeso: 0, somaVP: 0 }
    g.itens.push({ tipo: nt.avaliacao?.tipo ?? '?', valor: Number(nt.valor) })
    g.somaPeso += peso
    g.somaVP += Number(nt.valor) * peso
    porDisc.set(disc, g)
  }
  const disciplinas = Array.from(porDisc.entries()).map(([nome, g]) => ({
    nome,
    itens: g.itens.sort((a, b) => a.tipo.localeCompare(b.tipo)),
    media: Math.round((g.somaVP / g.somaPeso) * 10) / 10,
  }))

  const totalAulas = freqs.length
  const presencas = freqs.filter((f) => f.presente).length
  const freqPercent = totalAulas > 0 ? Math.round((presencas / totalAulas) * 100) : 100
  const faltasLista = freqs
    .filter((f) => !f.presente)
    .map((f) => f.data)
    .sort()

  return {
    semMatricula: false as const,
    codigo: matricula.codigo,
    nome: matricula.nome_aluno,
    turmas: (mts ?? []).map((m: any) => m.turma?.nome).filter(Boolean),
    disciplinas,
    totalAulas,
    presencas,
    faltas: totalAulas - presencas,
    freqPercent,
    faltasLista,
  }
}

export default function AlunoPortalPage() {
  const { perfil, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['meus-dados', perfil?.id],
    queryFn: () => carregarMeusDados(perfil!.id),
    enabled: !!perfil,
  })

  async function sair() {
    await logout()
    navigate('/aluno/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">Portal do Aluno</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button onClick={sair} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {isLoading || !data ? (
          <Spinner />
        ) : data.semMatricula ? (
          <div className="card"><EmptyState message="Sua conta não está vinculada a uma matrícula." /></div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                Olá, {data.nome}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {data.codigo} {data.turmas.length > 0 && `· ${data.turmas.join(', ')}`}
              </p>
            </div>

            {/* Resumo */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="card p-5">
                <div className="text-sm text-slate-500 dark:text-slate-400">Frequência</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{data.freqPercent}%</span>
                  <Badge color={data.freqPercent >= FREQUENCIA_MINIMA ? 'green' : 'amber'}>
                    {data.freqPercent >= FREQUENCIA_MINIMA ? 'Regular' : 'Baixa'}
                  </Badge>
                </div>
              </div>
              <div className="card p-5">
                <div className="text-sm text-slate-500 dark:text-slate-400">Presenças</div>
                <div className="mt-2 text-3xl font-semibold text-green-600">{data.presencas}</div>
              </div>
              <div className="card p-5">
                <div className="text-sm text-slate-500 dark:text-slate-400">Faltas</div>
                <div className="mt-2 text-3xl font-semibold text-red-600">{data.faltas}</div>
              </div>
            </div>

            {/* Notas por disciplina */}
            <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Minhas notas</h2>
            {data.disciplinas.length === 0 ? (
              <div className="card mb-6"><EmptyState message="Nenhuma nota lançada ainda." /></div>
            ) : (
              <div className="mb-6 space-y-3">
                {data.disciplinas.map((d) => (
                  <div key={d.nome} className="card p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{d.nome}</span>
                      <Badge color={d.media >= 6 ? 'green' : 'red'}>Média {d.media.toFixed(1)}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {d.itens.map((it, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">
                          <span className="text-slate-400">{it.tipo.toUpperCase()}:</span>{' '}
                          <span className={it.valor >= 6 ? 'text-green-600' : 'text-red-600'}>
                            {it.valor.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Faltas */}
            <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Registro de faltas</h2>
            <div className="card p-5">
              {data.faltasLista.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma falta registrada. 🎉</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.faltasLista.map((d, i) => (
                    <Badge key={i} color="red">
                      {new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
