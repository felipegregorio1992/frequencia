import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { TipoUsuario } from '../types/domain'

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: TipoUsuario[]
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
    return <Navigate to="/login" replace />
  }

  // Força troca de senha no primeiro acesso (exceto se já estiver na tela de senha).
  if (perfil?.primeiro_acesso && location.pathname !== '/senha') {
    return <Navigate to="/senha" replace />
  }

  // Restrição por papel: quem não tem permissão volta para a home.
  if (roles && perfil && !roles.includes(perfil.tipo)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
