import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { PageHeader, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'

const FREQUENCIA_MINIMA = 75 // %

interface LinhaBoletim {
  aluno: string
  turma: string
  disciplina: string
  media: number
  freqPercent: number
  aprovado: boolean
}

async function carregarBoletim(): Promise<LinhaBoletim[]> {
  // Busca notas com avaliação (peso + disciplina) e o aluno/turma
  const { data: notas } = await supabase
    .from('notas')
    .select(
      'valor, matricula_turma_id, avaliacao:avaliacoes(peso, disciplina:disciplinas(nome)), matricula_turma:matriculas_turmas(matricula:matriculas(codigo), turma:turmas(nome))',
    )
  const { data: freqs } = await supabase
    .from('frequencias')
    .select('matricula_turma_id, presente')

  // frequência por matricula_turma
  const freqPorMt = new Map<number, { total: number; presentes: number }>()
  for (const f of freqs ?? []) {
    const mt = f.matricula_turma_id as number
    const atual = freqPorMt.get(mt) ?? { total: 0, presentes: 0 }
    atual.total++
    if (f.presente) atual.presentes++
    freqPorMt.set(mt, atual)
  }

  // agrupa notas por (matricula_turma + disciplina) para média ponderada
  type Acc = {
    aluno: string
    turma: string
    disciplina: string
    mt: number
    somaPeso: number
    somaValorPeso: number
  }
  const grupos = new Map<string, Acc>()

  for (const n of (notas ?? []) as any[]) {
    const mt = n.matricula_turma_id as number
    const disciplina = n.avaliacao?.disciplina?.nome ?? '—'
    const aluno = n.matricula_turma?.matricula?.codigo ?? '—'
    const turma = n.matricula_turma?.turma?.nome ?? '—'
    const peso = Number(n.avaliacao?.peso ?? 1)
    const valor = Number(n.valor)
    const chave = `${mt}::${disciplina}`
    const g = grupos.get(chave) ?? {
      aluno,
      turma,
      disciplina,
      mt,
      somaPeso: 0,
      somaValorPeso: 0,
    }
    g.somaPeso += peso
    g.somaValorPeso += valor * peso
    grupos.set(chave, g)
  }

  const linhas: LinhaBoletim[] = []
  for (const g of grupos.values()) {
    const media = g.somaPeso > 0 ? g.somaValorPeso / g.somaPeso : 0
    const f = freqPorMt.get(g.mt)
    const freqPercent = f && f.total > 0 ? (f.presentes / f.total) * 100 : 100
    const aprovado = media >= 6 && freqPercent >= FREQUENCIA_MINIMA
    linhas.push({
      aluno: g.aluno,
      turma: g.turma,
      disciplina: g.disciplina,
      media: Math.round(media * 10) / 10,
      freqPercent: Math.round(freqPercent),
      aprovado,
    })
  }

  linhas.sort(
    (a, b) => a.aluno.localeCompare(b.aluno) || a.disciplina.localeCompare(b.disciplina),
  )
  return linhas
}

export default function BoletimPage() {
  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ['boletim'],
    queryFn: carregarBoletim,
  })

  const colunas: Column<LinhaBoletim>[] = [
    { key: 'aluno', header: 'Aluno', accessor: (l) => l.aluno },
    {
      key: 'turma',
      header: 'Turma',
      accessor: (l) => l.turma,
      render: (l) => <span className="text-slate-500 dark:text-slate-400">{l.turma}</span>,
    },
    {
      key: 'disciplina',
      header: 'Disciplina',
      accessor: (l) => l.disciplina,
      render: (l) => <span className="text-slate-500 dark:text-slate-400">{l.disciplina}</span>,
    },
    {
      key: 'media',
      header: 'Média',
      accessor: (l) => l.media,
      render: (l) => <Badge color={l.media >= 6 ? 'green' : 'red'}>{l.media.toFixed(1)}</Badge>,
    },
    {
      key: 'freqPercent',
      header: 'Frequência',
      accessor: (l) => l.freqPercent,
      render: (l) => (
        <Badge color={l.freqPercent >= FREQUENCIA_MINIMA ? 'green' : 'amber'}>{l.freqPercent}%</Badge>
      ),
    },
    {
      key: 'aprovado',
      header: 'Situação',
      accessor: (l) => (l.aprovado ? 'Aprovado' : 'Reprovado'),
      render: (l) => (
        <Badge color={l.aprovado ? 'green' : 'red'}>{l.aprovado ? 'Aprovado' : 'Reprovado'}</Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Boletim"
        description={`Média ponderada por disciplina e frequência (mínimo ${FREQUENCIA_MINIMA}%).`}
      />

      <DataTable
        data={linhas}
        loading={isLoading}
        rowKey={(l) => `${l.aluno}-${l.turma}-${l.disciplina}`}
        emptyMessage="Sem dados para gerar o boletim."
        searchPlaceholder="Buscar por aluno, turma ou disciplina..."
        columns={colunas}
      />
    </div>
  )
}
