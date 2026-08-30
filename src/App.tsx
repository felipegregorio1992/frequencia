import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Spinner } from './ui/primitives'
import type { TipoUsuario } from './types/domain'
import LoginPage from './pages/LoginPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CursosPage = lazy(() => import('./pages/CursosPage'))
const DisciplinasPage = lazy(() => import('./pages/DisciplinasPage'))
const TurmasPage = lazy(() => import('./pages/TurmasPage'))
const MatriculasPage = lazy(() => import('./pages/MatriculasPage'))
const MatriculasTurmasPage = lazy(() => import('./pages/MatriculasTurmasPage'))
const AvaliacoesPage = lazy(() => import('./pages/AvaliacoesPage'))
const NotasPage = lazy(() => import('./pages/NotasPage'))
const FrequenciasPage = lazy(() => import('./pages/FrequenciasPage'))
const BoletimPage = lazy(() => import('./pages/BoletimPage'))
const RelatoriosPage = lazy(() => import('./pages/RelatoriosPage'))
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'))
const SenhaPage = lazy(() => import('./pages/SenhaPage'))

const ADMIN: TipoUsuario[] = ['ADMINISTRADOR']
const STAFF: TipoUsuario[] = ['ADMINISTRADOR', 'PROFESSOR']

// Envolve uma página com Suspense e, opcionalmente, restrição de papel.
function Pagina({ children, roles }: { children: ReactNode; roles?: TipoUsuario[] }) {
  const inner = <Suspense fallback={<Spinner />}>{children}</Suspense>
  if (roles) return <ProtectedRoute roles={roles}>{inner}</ProtectedRoute>
  return inner
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Pagina><DashboardPage /></Pagina>} />
        <Route path="/cursos" element={<Pagina roles={ADMIN}><CursosPage /></Pagina>} />
        <Route path="/disciplinas" element={<Pagina roles={ADMIN}><DisciplinasPage /></Pagina>} />
        <Route path="/turmas" element={<Pagina roles={ADMIN}><TurmasPage /></Pagina>} />
        <Route path="/matriculas" element={<Pagina roles={ADMIN}><MatriculasPage /></Pagina>} />
        <Route path="/matriculas-turmas" element={<Pagina roles={ADMIN}><MatriculasTurmasPage /></Pagina>} />
        <Route path="/usuarios" element={<Pagina roles={ADMIN}><UsuariosPage /></Pagina>} />
        <Route path="/avaliacoes" element={<Pagina roles={STAFF}><AvaliacoesPage /></Pagina>} />
        <Route path="/notas" element={<Pagina roles={STAFF}><NotasPage /></Pagina>} />
        <Route path="/frequencias" element={<Pagina roles={STAFF}><FrequenciasPage /></Pagina>} />
        <Route path="/relatorios" element={<Pagina roles={STAFF}><RelatoriosPage /></Pagina>} />
        <Route path="/boletim" element={<Pagina roles={STAFF}><BoletimPage /></Pagina>} />
        <Route path="/senha" element={<Pagina><SenhaPage /></Pagina>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
