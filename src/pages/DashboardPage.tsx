import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { GraduationCap, BookOpen, School, PenLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { PageHeader, Spinner } from '../ui/primitives'

const CORES = ['#22c55e', '#ef4444', '#f59e0b', '#6366f1', '#06b6d4']

async function carregarGeral() {
  const [cursos, disciplinas, turmas, notas, freq] = await Promise.all([
    supabase.from('cursos').select('*', { count: 'exact', head: true }),
    supabase.from('disciplinas').select('*', { count: 'exact', head: true }),
    supabase.from('turmas').select('*', { count: 'exact', head: true }),
    supabase.from('notas').select('valor'),
    supabase.from('frequencias').select('presente'),
  ])
  const faixas = [
    { faixa: '0-4', min: 0, max: 4 },
    { faixa: '4-6', min: 4, max: 6 },
    { faixa: '6-8', min: 6, max: 8 },
    { faixa: '8-10', min: 8, max: 10.01 },
  ]
  const valores = (notas.data ?? []).map((n) => n.valor as number)
  const distribuicao = faixas.map((f) => ({
    faixa: f.faixa,
    qtd: valores.filter((v) => v >= f.min && v < f.max).length,
  }))
  const presencas = (freq.data ?? []).filter((f) => f.presente).length
  const faltas = (freq.data ?? []).length - presencas
  return {
    contagens: {
      cursos: cursos.count ?? 0,
      disciplinas: disciplinas.count ?? 0,
      turmas: turmas.count ?? 0,
      notas: valores.length,
    },
    distribuicao,
    frequencia: [
      { name: 'Presenças', value: presencas },
      { name: 'Faltas', value: faltas },
    ],
  }
}

export default function DashboardPage() {
  const { perfil } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['dash-geral'], queryFn: carregarGeral })
  const titulo = perfil?.tipo === 'PROFESSOR' ? 'Painel do Professor' : 'Dashboard'

  const cards = data
    ? [
        { label: 'Cursos', value: data.contagens.cursos, icon: GraduationCap, color: 'text-brand-600' },
        { label: 'Disciplinas', value: data.contagens.disciplinas, icon: BookOpen, color: 'text-green-600' },
        { label: 'Turmas', value: data.contagens.turmas, icon: School, color: 'text-amber-600' },
        { label: 'Notas lançadas', value: data.contagens.notas, icon: PenLine, color: 'text-cyan-600' },
      ]
    : []

  return (
    <div>
      <PageHeader title={titulo} description="Visão geral do sistema acadêmico." />

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cards.map((c) => {
              const Icon = c.icon
              return (
                <div key={c.label} className="card p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{c.label}</span>
                    <Icon className={`h-5 w-5 ${c.color}`} />
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                    {c.value}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                Distribuição de notas
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.distribuicao}>
                  <XAxis dataKey="faixa" stroke="#94a3b8" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="qtd" fill="#6366f1" radius={[6, 6, 0, 0]} name="Notas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-medium text-slate-700 dark:text-slate-300">Frequência</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data.frequencia} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {data.frequencia.map((_, i) => (
                      <Cell key={i} fill={CORES[i]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
