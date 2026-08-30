import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { TipoUsuario } from '../types/domain'

export function ProtectedRoute({
  children,
  roles,
  redirectTo = '/login',
}: {
  children: ReactNode
  roles?: TipoUsuario[]
  redirectTo?: string
}) {
  const { session, perfil, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Carregando...
      </div>
    )
  }

  if (!session) {
    return <Navigate to={redirectTo} replace />
  }

  // Alunos são direcionados ao portal do aluno; nunca à área administrativa.
  if (perfil?.tipo === 'ALUNO' && !location.pathname.startsWith('/aluno')) {
    return <Navigate to="/aluno" replace />
  }

  // Força troca de senha no primeiro acesso (só para staff; aluno cria no login).
  if (
    perfil?.primeiro_acesso &&
    perfil.tipo !== 'ALUNO' &&
    location.pathname !== '/senha'
  ) {
    return <Navigate to="/senha" replace />
  }

  // Restrição por papel.
  if (roles && perfil && !roles.includes(perfil.tipo)) {
    // aluno tentando área staff -> portal; staff tentando /aluno -> home
    return <Navigate to={perfil.tipo === 'ALUNO' ? '/aluno' : '/'} replace />
  }

  return <>{children}</>
}
