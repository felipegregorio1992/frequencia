import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { traduzErro } from '../hooks/useEntities'

export default function LoginPage() {
  const { login, session } = useAuth()
  const navigate = useNavigate()
  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session) {
    navigate('/', { replace: true })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await login(matricula, senha)
      navigate('/', { replace: true })
    } catch (err) {
      setErro(err instanceof Error ? traduzErro(err.message) : 'Matrícula ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo (marca) */}
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-brand-600 to-brand-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="text-xl font-semibold">Nota</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Sistema acadêmico
            <br />
            simples e completo
          </h1>
          <p className="mt-4 max-w-md text-brand-100">
            Gerencie cursos, turmas, notas e frequências em um só lugar.
          </p>
        </div>
        <p className="text-sm text-brand-200">© {new Date().getFullYear()} Nota — FAETEC</p>
      </div>

      {/* Painel direito (formulário) */}
      <div className="flex w-full items-center justify-center bg-slate-50 px-4 dark:bg-slate-950 lg:w-1/2">
        <form onSubmit={handleSubmit} className="card w-full max-w-sm p-8">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nota</span>
          </div>

          <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Bem-vindo de volta
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Acesse com sua matrícula.</p>

          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Matrícula
          </label>
          <input
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            className="input mb-4"
            placeholder="ex: admin"
            required
          />

          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Senha
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="input mb-4"
            placeholder="••••••••"
            required
          />

          {erro && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
              {erro}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <a
            href="/aluno/login"
            className="mt-4 block text-center text-sm text-slate-500 hover:text-brand-600"
          >
            Sou aluno
          </a>
        </form>
      </div>
    </div>
  )
}
