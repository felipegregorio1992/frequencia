import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus, Loader2, ShieldCheck, BookUser } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useList } from '../hooks/useEntities'
import { useToast } from '../ui/ToastContext'
import { PageHeader, Badge } from '../ui/primitives'
import { DataTable, type Column } from '../ui/DataTable'
import type { TipoUsuario, Usuario } from '../types/domain'

const TIPOS: { valor: TipoUsuario; label: string; icon: typeof ShieldCheck }[] = [
  { valor: 'PROFESSOR', label: 'Professor', icon: BookUser },
  { valor: 'ADMINISTRADOR', label: 'Administrador', icon: ShieldCheck },
]

export default function UsuariosPage() {
  const { notify } = useToast()
  const qc = useQueryClient()
  const { data: usuarios = [], isLoading } = useList<Usuario>('usuarios', '*', 'matricula')

  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [tipo, setTipo] = useState<TipoUsuario>('PROFESSOR')
  const [salvando, setSalvando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 6) {
      notify('A senha deve ter ao menos 6 caracteres.', 'error')
      return
    }
    setSalvando(true)
    try {
      const { data, error } = await supabase.functions.invoke('criar-usuario', {
        body: { matricula, senha, tipo },
      })
      if (error) {
        // erros lançados pela função vêm no context
        const msg = (data as { error?: string })?.error ?? error.message
        throw new Error(msg)
      }
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error)
      }
      notify(`Usuário ${matricula} criado.`, 'success')
      setMatricula('')
      setSenha('')
      setTipo('PROFESSOR')
      await qc.invalidateQueries({ queryKey: ['usuarios'] })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao criar usuário.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function alterarStatus(u: Usuario) {
    const { error } = await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id)
    if (error) {
      notify('Erro ao alterar status.', 'error')
      return
    }
    notify(`Usuário ${u.ativo ? 'desativado' : 'ativado'}.`, 'success')
    await qc.invalidateQueries({ queryKey: ['usuarios'] })
  }

  const corTipo = (t: TipoUsuario) => (t === 'ADMINISTRADOR' ? 'brand' : 'amber')

  const colunas: Column<Usuario>[] = [
    { key: 'matricula', header: 'Matrícula', accessor: (u) => u.matricula },
    {
      key: 'tipo',
      header: 'Tipo',
      accessor: (u) => u.tipo,
      render: (u) => <Badge color={corTipo(u.tipo)}>{u.tipo}</Badge>,
    },
    {
      key: 'ativo',
      header: 'Status',
      accessor: (u) => (u.ativo ? 'Ativo' : 'Inativo'),
      render: (u) => <Badge color={u.ativo ? 'green' : 'slate'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>,
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      sortable: false,
      render: (u) => (
        <button
          onClick={() => alterarStatus(u)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {u.ativo ? 'Desativar' : 'Ativar'}
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Usuários" description="Cadastre e gerencie alunos, professores e administradores." />

      <form onSubmit={handleSubmit} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Matrícula
          </label>
          <input
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="ex: aluno07"
            className="input"
            required
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Senha inicial
          </label>
          <input
            type="text"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="mín. 6 caracteres"
            className="input"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Tipo
          </label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoUsuario)} className="input w-44">
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={salvando} className="btn-primary">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Criar usuário
        </button>
      </form>

      <DataTable
        data={usuarios}
        loading={isLoading}
        rowKey={(u) => u.id}
        emptyMessage="Nenhum usuário cadastrado."
        searchPlaceholder="Buscar por matrícula..."
        columns={colunas}
      />
    </div>
  )
}
