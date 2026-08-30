import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth, matriculaToEmail } from '../../auth/AuthContext'
import { traduzErro } from '../../hooks/useEntities'

type Etapa = 'matricula' | 'senha' | 'criar-senha'

export default function AlunoLoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [etapa, setEtapa] = useState<Etapa>('matricula')
  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function verificarMatricula(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      // RPC no banco: existe? é primeiro acesso?
      const { data, error } = await supabase.rpc('verificar_matricula_aluno', {
        p_matricula: matricula.trim(),
      })
      if (error) throw error
      const linha = Array.isArray(data) ? data[0] : data
      if (!linha) {
        setErro('Matrícula não encontrada.')
        return
      }
      setEtapa(linha.primeiro_acesso ? 'criar-senha' : 'senha')
    } catch (err) {
      setErro(err instanceof Error ? traduzErro(err.message) : 'Matrícula não encontrada.')
    } finally {
      setLoading(false)
    }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await login(matricula, senha)
      navigate('/aluno', { replace: true })
    } catch {
      setErro('Senha incorreta.')
    } finally {
      setLoading(false)
    }
  }

  async function criarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 6) {
      setErro('A senha deve ter ao menos 6 caracteres.')
      return
    }
    if (senha !== confirmar) {
      setErro('As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      // 1) loga com a senha inicial (= a própria matrícula)
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: matriculaToEmail(matricula),
        password: matricula.trim().toLowerCase(),
      })
      if (loginErr) {
        setErro('Não foi possível iniciar o primeiro acesso. Fale com a secretaria.')
        return
      }
      // 2) define a senha real (usuário já está logado)
      const { error: upErr } = await supabase.auth.updateUser({ password: senha })
      if (upErr) throw upErr
      // 3) marca primeiro_acesso como concluído
      const { data: u } = await supabase.auth.getUser()
      if (u.user) {
        await supabase.from('usuarios').update({ primeiro_acesso: false }).eq('id', u.user.id)
      }
      navigate('/aluno', { replace: true })
    } catch (err) {
      setErro(err instanceof Error ? traduzErro(err.message) : 'Erro ao criar senha.')
    } finally {
      setLoading(false)
    }
  }

  function voltar() {
    setEtapa('matricula')
    setSenha('')
    setConfirmar('')
    setErro(null)
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-brand-600 to-brand-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="text-xl font-semibold">Portal do Aluno</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Suas notas e
            <br />
            frequência
          </h1>
          <p className="mt-4 max-w-md text-brand-100">
            Acompanhe seu desempenho acadêmico com a sua matrícula.
          </p>
        </div>
        <p className="text-sm text-brand-200">© {new Date().getFullYear()} Nota — FAETEC</p>
      </div>

      <div className="flex w-full items-center justify-center bg-slate-50 px-4 dark:bg-slate-950 lg:w-1/2">
        {etapa === 'matricula' && (
          <form onSubmit={verificarMatricula} className="card w-full max-w-sm p-8">
            <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              Portal do Aluno
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Digite sua matrícula para começar.
            </p>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Matrícula
            </label>
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              className="input mb-4"
              placeholder="ex: felipe01"
              autoFocus
              required
            />
            {erro && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{erro}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Continuar
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-4 w-full text-center text-sm text-slate-500 hover:text-brand-600"
            >
              Sou professor ou administrador
            </button>
          </form>
        )}

        {etapa === 'senha' && (
          <form onSubmit={entrar} className="card w-full max-w-sm p-8">
            <button type="button" onClick={voltar} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft className="h-4 w-4" /> voltar
            </button>
            <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              Olá, {matricula}
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Digite sua senha.</p>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="input mb-4"
              placeholder="Senha"
              autoFocus
              required
            />
            {erro && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{erro}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>
        )}

        {etapa === 'criar-senha' && (
          <form onSubmit={criarSenha} className="card w-full max-w-sm p-8">
            <button type="button" onClick={voltar} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft className="h-4 w-4" /> voltar
            </button>
            <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              Primeiro acesso
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Crie uma senha para a matrícula <strong>{matricula}</strong>.
            </p>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="input mb-3"
              placeholder="Nova senha (mín. 6)"
              autoFocus
              required
            />
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="input mb-4"
              placeholder="Confirmar senha"
              required
            />
            {erro && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{erro}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar senha e entrar
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
