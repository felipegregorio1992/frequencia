import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Usuario } from '../types/domain'

// A matrícula é tratada como um "email fake" no Supabase Auth,
// já que o Auth exige email. Formato: <matricula>@nota.local
const EMAIL_DOMAIN = 'nota.local'

export function matriculaToEmail(matricula: string): string {
  return `${matricula.trim().toLowerCase()}@${EMAIL_DOMAIN}`
}

interface AuthContextValue {
  session: Session | null
  perfil: Usuario | null
  loading: boolean
  isAdmin: boolean
  isProfessor: boolean
  isAluno: boolean
  canWrite: boolean
  login: (matricula: string, senha: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setPerfil(null)
      return
    }
    supabase
      .from('usuarios')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setPerfil(data as Usuario | null))
  }, [session])

  async function login(matricula: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: matriculaToEmail(matricula),
      password: senha,
    })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const isAdmin = perfil?.tipo === 'ADMINISTRADOR'
  const isProfessor = perfil?.tipo === 'PROFESSOR'
  const isAluno = perfil?.tipo === 'ALUNO'
  const canWrite = isAdmin || isProfessor

  return (
    <AuthContext.Provider
      value={{ session, perfil, loading, isAdmin, isProfessor, isAluno, canWrite, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
