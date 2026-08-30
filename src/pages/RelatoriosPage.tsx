import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { FileText, FileSpreadsheet, TrendingUp, CalendarCheck, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useList } from '../hooks/useEntities'
import { PageHeader, Spinner, EmptyState, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'
import type { Secao } from '../lib/export'
import type { Turma } from '../types/domain'

const FREQUENCIA_MINIMA = 75

type Aba = 'rendimento' | 'presenca' | 'consolidado'

interface Registro {
  aluno: string
  turma: string
  turmaId: number
  disciplina: string
  media: number
  totalAulas: number
  presencas: number
  freqPercent: number
  aprovado: boolean
}

// Monta os dados agregados por (aluno-turma, disciplina) com média ponderada e frequência.
async function carregarRelatorio(): Promise<Registro[]> {
  const { data: notas } = await supabase
    .from('notas')
    .select(
      'valor, matricula_turma_id, avaliacao:avaliacoes(peso, disciplina:disciplinas(nome)), matricula_turma:matriculas_turmas(turma_id, matricula:matriculas(codigo), turma:turmas(nome))',
    )
  const { data: freqs } = await supabase
    .from('frequencias')
    .select('matricula_turma_id, presente')

  const freqPorMt = new Map<number, { total: number; presentes: number }>()
  for (const f of freqs ?? []) {
    const mt = f.matricula_turma_id as number
    const a = freqPorMt.get(mt) ?? { total: 0, presentes: 0 }
    a.total++
    if (f.presente) a.presentes++
    freqPorMt.set(mt, a)
  }

  type Acc = {
    aluno: string
    turma: string
    turmaId: number
    disciplina: string
    mt: number
    somaPeso: number
    somaValorPeso: number
  }
  const grupos = new Map<string, Acc>()
  for (const n of (notas ?? []) as any[]) {
    const mt = n.matricula_turma_id as number
    const disciplina = n.avaliacao?.disciplina?.nome ?? '—'
    const chave = `${mt}::${disciplina}`
    const g = grupos.get(chave) ?? {
      aluno: n.matricula_turma?.matricula?.codigo ?? '—',
      turma: n.matricula_turma?.turma?.nome ?? '—',
      turmaId: n.matricula_turma?.turma_id ?? 0,
      disciplina,
      mt,
      somaPeso: 0,
      somaValorPeso: 0,
    }
    const peso = Number(n.avaliacao?.peso ?? 1)
    g.somaPeso += peso
    g.somaValorPeso += Number(n.valor) * peso
    grupos.set(chave, g)
  }

  const regs: Registro[] = []
  for (const g of grupos.values()) {
    const media = g.somaPeso > 0 ? g.somaValorPeso / g.somaPeso : 0
    const f = freqPorMt.get(g.mt)
    const total = f?.total ?? 0
    const presentes = f?.presentes ?? 0
    const freqPercent = total > 0 ? (presentes / total) * 100 : 100
    regs.push({
      aluno: g.aluno,
      turma: g.turma,
      turmaId: g.turmaId,
      disciplina: g.disciplina,
      media: Math.round(media * 10) / 10,
      totalAulas: total,
      presencas: presentes,
      freqPercent: Math.round(freqPercent),
      aprovado: media >= 6 && freqPercent >= FREQUENCIA_MINIMA,
    })
  }
  regs.sort(
    (a, b) =>
      a.turma.localeCompare(b.turma) ||
      a.aluno.localeCompare(b.aluno) ||
      a.disciplina.localeCompare(b.disciplina),
  )
  return regs
}

export default function RelatoriosPage() {
  const [aba, setAba] = useState<Aba>('rendimento')
  const [turmaFiltro, setTurmaFiltro] = useState('')

  const { data: turmas = [] } = useList<Turma>('turmas', '*', 'nome')
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['relatorio'],
    queryFn: carregarRelatorio,
  })

  const filtrados = useMemo(
    () => (turmaFiltro ? registros.filter((r) => String(r.turmaId) === turmaFiltro) : registros),
    [registros, turmaFiltro],
  )

  // Rendimento: média por disciplina (agregada entre alunos do filtro)
  const rendimentoPorDisciplina = useMemo(() => {
    const m = new Map<string, { soma: number; qtd: number }>()
    for (const r of filtrados) {
      const a = m.get(r.disciplina) ?? { soma: 0, qtd: 0 }
      a.soma += r.media
      a.qtd++
      m.set(r.disciplina, a)
    }
    return Array.from(m.entries()).map(([disciplina, v]) => ({
      disciplina,
      media: Math.round((v.soma / v.qtd) * 10) / 10,
    }))
  }, [filtrados])

  // Consolidado por aluno: agrupa disciplinas, média geral e situação
  const consolidado = useMemo(() => {
    const m = new Map<
      string,
      { aluno: string; turma: string; somaMedia: number; qtd: number; freq: number; itens: Registro[] }
    >()
    for (const r of filtrados) {
      const chave = `${r.aluno}::${r.turma}`
      const a = m.get(chave) ?? { aluno: r.aluno, turma: r.turma, somaMedia: 0, qtd: 0, freq: 0, itens: [] }
      a.somaMedia += r.media
      a.qtd++
      a.freq = r.freqPercent // mesma para todas as disciplinas da turma
      a.itens.push(r)
      m.set(chave, a)
    }
    return Array.from(m.values()).map((a) => ({
      aluno: a.aluno,
      turma: a.turma,
      mediaGeral: Math.round((a.somaMedia / a.qtd) * 10) / 10,
      freq: a.freq,
      itens: a.itens,
      situacao: a.somaMedia / a.qtd >= 6 && a.freq >= FREQUENCIA_MINIMA,
    }))
  }, [filtrados])

  const abas: { id: Aba; label: string; icon: typeof TrendingUp }[] = [
    { id: 'rendimento', label: 'Rendimento', icon: TrendingUp },
    { id: 'presenca', label: 'Presença', icon: CalendarCheck },
    { id: 'consolidado', label: 'Por Aluno', icon: User },
  ]

  // Monta as seções (tabelas) conforme a aba ativa, para exportação.
  function montarSecoes(): Secao[] {
    if (aba === 'rendimento') {
      return [
        {
          titulo: 'Rendimento por aluno',
          colunas: ['Aluno', 'Turma', 'Disciplina', 'Média'],
          linhas: filtrados.map((r) => [r.aluno, r.turma, r.disciplina, r.media.toFixed(1)]),
        },
      ]
    }
    if (aba === 'presenca') {
      return [
        {
          titulo: 'Presença',
          colunas: ['Aluno', 'Turma', 'Presenças', 'Aulas', 'Frequência (%)', 'Situação'],
          linhas: consolidado.map((c) => [
            c.aluno,
            c.turma,
            c.itens[0]?.presencas ?? 0,
            c.itens[0]?.totalAulas ?? 0,
            c.freq,
            c.freq >= FREQUENCIA_MINIMA ? 'Regular' : 'Abaixo',
          ]),
        },
      ]
    }
    // consolidado
    return [
      {
        titulo: 'Consolidado por aluno',
        colunas: ['Aluno', 'Turma', 'Média geral', 'Frequência (%)', 'Situação'],
        linhas: consolidado.map((c) => [
          c.aluno,
          c.turma,
          c.mediaGeral.toFixed(1),
          c.freq,
          c.situacao ? 'Aprovado' : 'Reprovado',
        ]),
      },
      {
        titulo: 'Notas por disciplina',
        colunas: ['Aluno', 'Turma', 'Disciplina', 'Média'],
        linhas: consolidado.flatMap((c) =>
          c.itens.map((item) => [c.aluno, c.turma, item.disciplina, item.media.toFixed(1)]),
        ),
      },
    ]
  }

  const tituloRelatorio = `Relatório de ${
    aba === 'rendimento' ? 'Rendimento' : aba === 'presenca' ? 'Presença' : 'Desempenho'
  }`
  const nomeArquivo = `relatorio-${aba}${turmaFiltro ? '-turma' : ''}`

  async function handlePDF() {
    const { exportarPDF } = await import('../lib/export')
    exportarPDF(tituloRelatorio, montarSecoes(), nomeArquivo)
  }
  async function handleExcel() {
    const { exportarExcel } = await import('../lib/export')
    exportarExcel(montarSecoes(), nomeArquivo)
  }

  type ConsolidadoItem = (typeof consolidado)[number]

  const colunasRendimento: Column<Registro>[] = [
    { key: 'aluno', header: 'Aluno', accessor: (r) => r.aluno },
    {
      key: 'turma',
      header: 'Turma',
      accessor: (r) => r.turma,
      render: (r) => <span className="text-slate-500 dark:text-slate-400">{r.turma}</span>,
    },
    {
      key: 'disciplina',
      header: 'Disciplina',
      accessor: (r) => r.disciplina,
      render: (r) => <span className="text-slate-500 dark:text-slate-400">{r.disciplina}</span>,
    },
    {
      key: 'media',
      header: 'Média',
      accessor: (r) => r.media,
      render: (r) => <Badge color={r.media >= 6 ? 'green' : 'red'}>{r.media.toFixed(1)}</Badge>,
    },
  ]

  const colunasPresenca: Column<ConsolidadoItem>[] = [
    { key: 'aluno', header: 'Aluno', accessor: (c) => c.aluno },
    {
      key: 'turma',
      header: 'Turma',
      accessor: (c) => c.turma,
      render: (c) => <span className="text-slate-500 dark:text-slate-400">{c.turma}</span>,
    },
    {
      key: 'presencas',
      header: 'Presenças',
      accessor: (c) => c.itens[0]?.presencas ?? 0,
      render: (c) => <span className="text-slate-500 dark:text-slate-400">{c.itens[0]?.presencas ?? 0}</span>,
    },
    {
      key: 'aulas',
      header: 'Aulas',
      accessor: (c) => c.itens[0]?.totalAulas ?? 0,
      render: (c) => <span className="text-slate-500 dark:text-slate-400">{c.itens[0]?.totalAulas ?? 0}</span>,
    },
    {
      key: 'freq',
      header: 'Frequência',
      accessor: (c) => c.freq,
      render: (c) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full ${c.freq >= FREQUENCIA_MINIMA ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${c.freq}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">{c.freq}%</span>
        </div>
      ),
    },
    {
      key: 'situacao',
      header: 'Situação',
      accessor: (c) => (c.freq >= FREQUENCIA_MINIMA ? 'Regular' : 'Abaixo'),
      render: (c) => (
        <Badge color={c.freq >= FREQUENCIA_MINIMA ? 'green' : 'amber'}>
          {c.freq >= FREQUENCIA_MINIMA ? 'Regular' : 'Abaixo'}
        </Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Rendimento, presença e desempenho consolidado dos alunos."
        actions={
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handlePDF}
              disabled={filtrados.length === 0}
              className="btn-ghost disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={handleExcel}
              disabled={filtrados.length === 0}
              className="btn-ghost disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {abas.map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  aba === a.id
                    ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                {a.label}
              </button>
            )
          })}
        </div>
        <select
          value={turmaFiltro}
          onChange={(e) => setTurmaFiltro(e.target.value)}
          className="input w-full sm:w-56"
        >
          <option value="">Todas as turmas</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="card">
          <Spinner />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card">
          <EmptyState message="Sem dados para o relatório." />
        </div>
      ) : (
        <>
          {aba === 'rendimento' && (
            <div className="space-y-4">
              <div className="card p-5">
                <h3 className="mb-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Média por disciplina
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={rendimentoPorDisciplina} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 10]} stroke="#94a3b8" fontSize={12} />
                    <YAxis type="category" dataKey="disciplina" width={140} stroke="#94a3b8" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="media" radius={[0, 6, 6, 0]} name="Média">
                      {rendimentoPorDisciplina.map((d, i) => (
                        <Cell key={i} fill={d.media >= 6 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <DataTable
                data={filtrados}
                rowKey={(r) => `${r.aluno}-${r.turma}-${r.disciplina}`}
                searchPlaceholder="Buscar por aluno, turma ou disciplina..."
                columns={colunasRendimento}
              />
            </div>
          )}

          {aba === 'presenca' && (
            <DataTable
              data={consolidado}
              rowKey={(c) => `${c.aluno}-${c.turma}`}
              searchPlaceholder="Buscar por aluno ou turma..."
              columns={colunasPresenca}
            />
          )}

          {aba === 'consolidado' && (
            <div className="space-y-4">
              {consolidado.map((c, i) => (
                <div key={i} className="card p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {c.aluno}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{c.turma}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color="brand">Média geral {c.mediaGeral.toFixed(1)}</Badge>
                      <Badge color={c.freq >= FREQUENCIA_MINIMA ? 'green' : 'amber'}>
                        Frequência {c.freq}%
                      </Badge>
                      <Badge color={c.situacao ? 'green' : 'red'}>
                        {c.situacao ? 'Aprovado' : 'Reprovado'}
                      </Badge>
                    </div>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-1 font-medium">Disciplina</th>
                        <th className="py-1 font-medium">Média</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.itens.map((item, j) => (
                        <tr key={j} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-2 text-slate-700 dark:text-slate-200">{item.disciplina}</td>
                          <td className="py-2">
                            <Badge color={item.media >= 6 ? 'green' : 'red'}>
                              {item.media.toFixed(1)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
