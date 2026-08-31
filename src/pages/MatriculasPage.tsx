import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, Upload, Download } from 'lucide-react'
import type { Matricula, Turma } from '../types/domain'
import { supabase } from '../lib/supabase'
import { useList, useEntityMutations, traduzErro } from '../hooks/useEntities'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'
import { useConfirm } from '../ui/ConfirmContext'
import { PageHeader, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'
import { exportarExcel, lerPlanilha } from '../lib/export'

interface MatriculaComTurmas extends Matricula {
  matriculas_turmas?: {
    turma?: { id: number; nome: string } | null
  }[]
  // Matérias que o aluno realmente cursa (vínculo aluno<->matéria).
  matriculas_disciplinas?: {
    disciplina?: { id: number; nome: string } | null
  }[]
}

export default function MatriculasPage() {
  const { canWrite, isAdmin } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const qc = useQueryClient()
  const { data: matriculas = [], isLoading } = useList<MatriculaComTurmas>(
    'matriculas',
    'id, codigo, nome_aluno, ativo, usuario_id, matriculas_turmas(turma:turmas(id, nome)), matriculas_disciplinas(disciplina:disciplinas(id, nome))',
    'codigo',
  )
  // RLS limita as turmas às do professor logado (admin vê todas).
  const { data: turmas = [] } = useList<Turma>('turmas', 'id, nome, quantidade_tempos, curso_id', 'nome')
  // Matérias (disciplinas) por turma, para mostrar/oferecer cadastro no form.
  const { data: disciplinas = [] } = useList<{ id: number; nome: string; turma_id: number | null }>(
    'disciplinas',
    'id, nome, turma_id',
    'nome',
  )
  const { update, remove } = useEntityMutations('matriculas')

  const [codigo, setCodigo] = useState('')
  const [nomeAluno, setNomeAluno] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [importando, setImportando] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)
  // Matérias que o aluno vai cursar (seleção no cadastro).
  const [materiasSelecionadas, setMateriasSelecionadas] = useState<number[]>([])
  // Cadastro rápido de matéria para a turma selecionada.
  const [novaMateria, setNovaMateria] = useState('')
  const [salvandoMateria, setSalvandoMateria] = useState(false)
  // Painel de turmas/matérias do aluno (aberto ao clicar no nome).
  const [alunoTurmas, setAlunoTurmas] = useState<MatriculaComTurmas | null>(null)
  const [turmasSelecionadas, setTurmasSelecionadas] = useState<number[]>([])
  const [materiasDoPainel, setMateriasDoPainel] = useState<number[]>([])
  const [salvandoTurmas, setSalvandoTurmas] = useState(false)

  // Matérias já cadastradas para a turma escolhida no formulário.
  const materiasDaTurma = turmaId
    ? disciplinas.filter((d) => String(d.turma_id ?? '') === turmaId)
    : []

  // Ao trocar a turma no formulário: por padrão marca todas as matérias dela.
  function selecionarTurma(novaTurmaId: string) {
    setTurmaId(novaTurmaId)
    const daTurma = disciplinas.filter((d) => String(d.turma_id ?? '') === novaTurmaId)
    setMateriasSelecionadas(daTurma.map((d) => d.id))
  }

  function toggleMateriaSelecionada(id: number) {
    setMateriasSelecionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Professor precisa vincular o aluno a uma turma dele (senão o próprio
  // professor não veria o aluno por causa do isolamento). Admin pode deixar
  // sem turma e vincular depois em "Alunos / Turmas".
  const turmaObrigatoria = !isAdmin

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // A turma só é obrigatória ao CRIAR um aluno novo (para o professor
    // conseguir vê-lo). Na edição, só mudamos código/nome/ativo.
    if (!editandoId && turmaObrigatoria && !turmaId) {
      notify('Selecione a turma do aluno.', 'error')
      return
    }
    setSalvando(true)
    try {
      if (editandoId) {
        await update.mutateAsync({ id: editandoId, payload: { codigo, nome_aluno: nomeAluno, ativo } })
        notify('Aluno atualizado.', 'success')
      } else if (turmaId) {
        // Cadastro com turma: usa RPC que cria matrícula + vínculo atomicamente
        // (evita problema de RLS ao ler a linha recém-criada). O trigger cria o
        // login do aluno (senha inicial = código; ele troca no 1º acesso).
        const { data, error } = await supabase.rpc('cadastrar_aluno_na_turma', {
          p_codigo: codigo,
          p_nome: nomeAluno,
          p_turma_id: Number(turmaId),
          p_ativo: ativo,
          p_disciplinas: materiasSelecionadas,
        })
        if (error) throw new Error(traduzErro(error.message))
        const res = data as { ok?: boolean; error?: string }
        if (res?.error) throw new Error(res.error)
        await qc.invalidateQueries({ queryKey: ['matriculas'] })
        await qc.invalidateQueries({ queryKey: ['matriculas_turmas'] })
        await qc.invalidateQueries({ queryKey: ['matriculas_disciplinas'] })
        notify(`Aluno ${codigo} cadastrado. Senha inicial = a matrícula; ele define a senha no 1º acesso.`, 'success')
      } else {
        // Admin sem turma: cria só a matrícula (vincula depois em Alunos/Turmas).
        const { error } = await supabase.from('matriculas').insert({ codigo, nome_aluno: nomeAluno, ativo })
        if (error) throw new Error(traduzErro(error.message))
        await qc.invalidateQueries({ queryKey: ['matriculas'] })
        notify(`Aluno ${codigo} cadastrado. Senha inicial = a matrícula; ele define a senha no 1º acesso.`, 'success')
      }
      cancelar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  // Cria um aluno respeitando o isolamento: com turma usa a RPC (cria
  // matrícula + vínculo); admin sem turma cria só a matrícula.
  async function criarAluno(cod: string, nome: string, turma: number | null, ativoAluno = true) {
    if (turma) {
      const { data, error } = await supabase.rpc('cadastrar_aluno_na_turma', {
        p_codigo: cod,
        p_nome: nome,
        p_turma_id: turma,
        p_ativo: ativoAluno,
      })
      if (error) throw new Error(traduzErro(error.message))
      const res = data as { ok?: boolean; error?: string }
      if (res?.error) throw new Error(res.error)
    } else {
      const { error } = await supabase.from('matriculas').insert({ codigo: cod, nome_aluno: nome, ativo: ativoAluno })
      if (error) throw new Error(traduzErro(error.message))
    }
  }

  // Cadastra uma matéria na turma selecionada, direto do formulário de aluno.
  async function cadastrarMateria() {
    if (!turmaId) {
      notify('Selecione a turma primeiro.', 'error')
      return
    }
    if (!novaMateria.trim()) {
      notify('Informe o nome da matéria.', 'error')
      return
    }
    setSalvandoMateria(true)
    try {
      const { error } = await supabase
        .from('disciplinas')
        .insert({ nome: novaMateria.trim(), turma_id: Number(turmaId) })
      if (error) throw new Error(traduzErro(error.message))
      setNovaMateria('')
      await qc.invalidateQueries({ queryKey: ['disciplinas'] })
      await qc.invalidateQueries({ queryKey: ['matriculas'] })
      notify('Matéria cadastrada.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao cadastrar matéria.', 'error')
    } finally {
      setSalvandoMateria(false)
    }
  }

  // Abre o painel de edição do aluno (dados + turmas + matérias).
  function abrirTurmasDoAluno(m: MatriculaComTurmas) {
    setAlunoTurmas(m)
    setCodigo(m.codigo)
    setNomeAluno(m.nome_aluno)
    setAtivo(m.ativo)
    setTurmasSelecionadas(
      (m.matriculas_turmas ?? [])
        .map((mt) => mt.turma?.id)
        .filter((id): id is number => typeof id === 'number'),
    )
    setMateriasDoPainel(
      (m.matriculas_disciplinas ?? [])
        .map((md) => md.disciplina?.id)
        .filter((id): id is number => typeof id === 'number'),
    )
  }

  // Fecha o painel e limpa os campos (para não vazar dados no form de cadastro).
  function fecharPainel() {
    setAlunoTurmas(null)
    setCodigo('')
    setNomeAluno('')
    setAtivo(true)
    setTurmasSelecionadas([])
    setMateriasDoPainel([])
  }

  function toggleTurmaSelecionada(id: number) {
    setTurmasSelecionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleMateriaPainel(id: number) {
    setMateriasDoPainel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Matérias disponíveis no painel = as das turmas atualmente selecionadas.
  const materiasDisponiveisPainel = disciplinas.filter(
    (d) => d.turma_id != null && turmasSelecionadas.includes(d.turma_id),
  )

  // Sincroniza os vínculos aluno-turma com a seleção do painel.
  async function salvarTurmasDoAluno() {
    if (!alunoTurmas) return
    setSalvandoTurmas(true)
    try {
      // Atualiza dados básicos do aluno (código, nome, ativo).
      const { error: upErr } = await supabase
        .from('matriculas')
        .update({ codigo, nome_aluno: nomeAluno, ativo })
        .eq('id', alunoTurmas.id)
      if (upErr) throw new Error(traduzErro(upErr.message))

      const atuais = (alunoTurmas.matriculas_turmas ?? [])
        .map((mt) => mt.turma?.id)
        .filter((id): id is number => typeof id === 'number')

      const paraAdicionar = turmasSelecionadas.filter((id) => !atuais.includes(id))
      const paraRemover = atuais.filter((id) => !turmasSelecionadas.includes(id))

      if (paraAdicionar.length) {
        const { error } = await supabase
          .from('matriculas_turmas')
          .insert(paraAdicionar.map((turma_id) => ({ matricula_id: alunoTurmas.id, turma_id })))
        if (error) throw new Error(traduzErro(error.message))
      }
      for (const turma_id of paraRemover) {
        const { error } = await supabase
          .from('matriculas_turmas')
          .delete()
          .eq('matricula_id', alunoTurmas.id)
          .eq('turma_id', turma_id)
        if (error) throw new Error(traduzErro(error.message))
      }

      // Sincroniza as matérias do aluno. Só valem as matérias de turmas ainda
      // selecionadas (se a turma saiu, suas matérias também saem).
      const idsMateriasValidas = disciplinas
        .filter((d) => d.turma_id != null && turmasSelecionadas.includes(d.turma_id))
        .map((d) => d.id)
      const materiasFinais = materiasDoPainel.filter((id) => idsMateriasValidas.includes(id))

      const materiasAtuais = (alunoTurmas.matriculas_disciplinas ?? [])
        .map((md) => md.disciplina?.id)
        .filter((id): id is number => typeof id === 'number')

      const matAdicionar = materiasFinais.filter((id) => !materiasAtuais.includes(id))
      const matRemover = materiasAtuais.filter((id) => !materiasFinais.includes(id))

      if (matAdicionar.length) {
        const { error } = await supabase
          .from('matriculas_disciplinas')
          .insert(matAdicionar.map((disciplina_id) => ({ matricula_id: alunoTurmas.id, disciplina_id })))
        if (error) throw new Error(traduzErro(error.message))
      }
      for (const disciplina_id of matRemover) {
        const { error } = await supabase
          .from('matriculas_disciplinas')
          .delete()
          .eq('matricula_id', alunoTurmas.id)
          .eq('disciplina_id', disciplina_id)
        if (error) throw new Error(traduzErro(error.message))
      }

      await qc.invalidateQueries({ queryKey: ['matriculas'] })
      await qc.invalidateQueries({ queryKey: ['matriculas_turmas'] })
      await qc.invalidateQueries({ queryKey: ['matriculas_disciplinas'] })
      notify('Aluno atualizado.', 'success')
      fecharPainel()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar turmas.', 'error')
    } finally {
      setSalvandoTurmas(false)
    }
  }

  // Baixa um modelo .xlsx com as colunas que o sistema entende na importação.
  function baixarModelo() {
    exportarExcel(
      [
        {
          titulo: 'Alunos',
          colunas: ['matricula', 'nome'],
          linhas: [
            ['2024001', 'Maria da Silva'],
            ['2024002', 'João de Souza'],
          ],
        },
      ],
      'modelo-alunos',
    )
  }

  async function handleImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (arquivo) e.target.value = '' // permite reimportar o mesmo arquivo
    if (!arquivo) return

    if (turmaObrigatoria && !turmaId) {
      notify('Selecione a turma antes de importar.', 'error')
      return
    }
    setImportando(true)
    try {
      const linhas = await lerPlanilha(arquivo)
      if (!linhas.length) {
        notify('A planilha está vazia.', 'error')
        return
      }
      // Aceita cabeçalhos "matricula"/"codigo" e "nome"/"nome_aluno".
      const pegar = (l: Record<string, string>, chaves: string[]) => {
        for (const k of chaves) if (l[k]) return l[k]
        return ''
      }

      const turma = turmaId ? Number(turmaId) : null
      let ok = 0
      const erros: string[] = []
      for (const [i, l] of linhas.entries()) {
        const cod = pegar(l, ['matricula', 'codigo', 'código'])
        const nome = pegar(l, ['nome', 'nome_aluno', 'aluno'])
        if (!cod || !nome) {
          erros.push(`Linha ${i + 2}: matrícula ou nome em branco.`)
          continue
        }
        try {
          await criarAluno(cod, nome, turma, true)
          ok++
        } catch (err) {
          erros.push(`Linha ${i + 2} (${cod}): ${err instanceof Error ? err.message : 'erro'}`)
        }
      }

      await qc.invalidateQueries({ queryKey: ['matriculas'] })
      await qc.invalidateQueries({ queryKey: ['matriculas_turmas'] })

      if (ok) notify(`${ok} aluno(s) importado(s) com sucesso.`, 'success')
      if (erros.length) {
        notify(`${erros.length} linha(s) com problema. ${erros.slice(0, 3).join(' | ')}`, 'error')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao ler a planilha.', 'error')
    } finally {
      setImportando(false)
    }
  }

  function cancelar() {
    setEditandoId(null)
    setCodigo('')
    setNomeAluno('')
    setTurmaId('')
    setMateriasSelecionadas([])
    setAtivo(true)
  }

  async function excluir(m: Matricula) {
    const ok = await confirm({
      message: `Excluir o aluno "${m.codigo}" (${m.nome_aluno})?`,
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(m.id)
      notify('Aluno excluído.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    }
  }

  // Matérias que o aluno cursa (as escolhidas no vínculo aluno<->matéria).
  function materiasDoAluno(m: MatriculaComTurmas): string[] {
    const nomes = new Set<string>()
    for (const md of m.matriculas_disciplinas ?? []) {
      if (md.disciplina?.nome) nomes.add(md.disciplina.nome)
    }
    return [...nomes]
  }

  const colunas: Column<MatriculaComTurmas>[] = [
    { key: 'codigo', header: 'Código', accessor: (m) => m.codigo },
    {
      key: 'nome_aluno',
      header: 'Aluno',
      accessor: (m) => m.nome_aluno,
      render: (m) =>
        canWrite ? (
          <button
            type="button"
            onClick={() => abrirTurmasDoAluno(m)}
            className="text-left font-medium text-brand-600 hover:underline dark:text-brand-400"
            title="Gerenciar turmas do aluno"
          >
            {m.nome_aluno}
          </button>
        ) : (
          <span>{m.nome_aluno}</span>
        ),
    },
    {
      key: 'materias',
      header: 'Matérias',
      sortable: false,
      accessor: (m) => materiasDoAluno(m).join(', '),
      render: (m) => {
        const materias = materiasDoAluno(m)
        if (!materias.length) return <span className="text-slate-400">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {materias.map((nome) => (
              <Badge key={nome} color="brand">
                {nome}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      key: 'ativo',
      header: 'Status',
      accessor: (m) => (m.ativo ? 'Ativo' : 'Inativo'),
      render: (m) => <Badge color={m.ativo ? 'green' : 'slate'}>{m.ativo ? 'Ativo' : 'Inativo'}</Badge>,
    },
    ...(canWrite
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'right' as const,
            sortable: false,
            render: (m: MatriculaComTurmas) => (
              <div className="flex justify-end">
                <button
                  onClick={() => abrirTurmasDoAluno(m)}
                  className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                  title="Editar aluno, turmas e matérias"
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
      <PageHeader title="Alunos" description="Cadastre os alunos das suas turmas." />

      {canWrite && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={baixarModelo} className="btn-ghost">
            <Download className="h-4 w-4" />
            Baixar modelo
          </button>
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            disabled={importando}
            className="btn-ghost"
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar Excel
          </button>
          <input
            ref={inputArquivo}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportar}
            className="hidden"
          />
          {turmaObrigatoria && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Selecione a turma abaixo antes de importar.
            </span>
          )}
        </div>
      )}

      {canWrite && (
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
          {!editandoId && (
            <select
              value={turmaId}
              onChange={(e) => selecionarTurma(e.target.value)}
              className="input w-full sm:w-52"
              required={turmaObrigatoria}
            >
              <option value="">{isAdmin ? 'Turma (opcional)' : 'Selecione a turma'}</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          )}
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

      {/* Matérias da turma: seleção do que o aluno vai cursar (ou cadastro rápido). */}
      {canWrite && !editandoId && turmaId && (
        <div className="card mb-6 p-4">
          <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Matérias que o aluno vai cursar
          </div>
          {materiasDaTurma.length > 0 ? (
            <div>
              <div className="flex flex-wrap gap-2">
                {materiasDaTurma.map((d) => {
                  const marcada = materiasSelecionadas.includes(d.id)
                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => toggleMateriaSelecionada(d.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        marcada
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {marcada ? '✓ ' : ''}
                      {d.nome}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Clique para marcar/desmarcar. Marque uma, algumas ou todas as matérias.
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                Esta turma ainda não tem matéria cadastrada. Cadastre uma agora:
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={novaMateria}
                  onChange={(e) => setNovaMateria(e.target.value)}
                  placeholder="Nome da matéria"
                  className="input flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      cadastrarMateria()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={cadastrarMateria}
                  disabled={salvandoMateria}
                  className="btn-primary"
                >
                  {salvandoMateria ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Cadastrar matéria
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <DataTable
        data={matriculas}
        loading={isLoading}
        rowKey={(m) => m.id}
        emptyMessage="Nenhum aluno cadastrado."
        searchPlaceholder="Buscar por código ou nome..."
        columns={colunas}
      />

      {/* Painel: turmas do aluno (uma ou mais). */}
      {alunoTurmas && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onClick={fecharPainel}
        >
          <div
            className="card my-8 w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Editar aluno
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Dados do aluno, turmas e matérias que ele cursa.
            </p>

            <div className="mt-4 space-y-2">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código"
                className="input w-full"
              />
              <input
                value={nomeAluno}
                onChange={(e) => setNomeAluno(e.target.value)}
                placeholder="Nome do aluno"
                className="input w-full"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                Ativo
              </label>
            </div>

            <div className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">Turmas</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {turmas.length === 0 ? (
                <span className="text-sm text-slate-400">Nenhuma turma disponível.</span>
              ) : (
                turmas.map((t) => {
                  const ativa = turmasSelecionadas.includes(t.id)
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTurmaSelecionada(t.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        ativa
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {t.nome}
                    </button>
                  )
                })
              )}
            </div>

            <div className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">Matérias</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {materiasDisponiveisPainel.length === 0 ? (
                <span className="text-sm text-slate-400">
                  Selecione uma turma com matérias para escolher.
                </span>
              ) : (
                materiasDisponiveisPainel.map((d) => {
                  const marcada = materiasDoPainel.includes(d.id)
                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => toggleMateriaPainel(d.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        marcada
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {marcada ? '✓ ' : ''}
                      {d.nome}
                    </button>
                  )
                })
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={fecharPainel} className="btn-ghost">
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarTurmasDoAluno}
                disabled={salvandoTurmas}
                className="btn-primary"
              >
                {salvandoTurmas ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
