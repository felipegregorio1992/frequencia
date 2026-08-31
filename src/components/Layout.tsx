import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Users2,
  UserCheck,
  UserCog,
  ClipboardList,
  PenLine,
  CalendarCheck,
  FileText,
  BarChart3,
  LogOut,
  Moon,
  Sun,
  Menu,
  KeyRound,
  School,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../ui/ThemeContext'

import type { TipoUsuario } from '../types/domain'

// roles: quem pode ver cada item. Se omitido, todos veem.
const navItems: {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  roles?: TipoUsuario[]
}[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['ADMINISTRADOR'] },
  { to: '/cursos', label: 'Cursos', icon: GraduationCap, roles: ['ADMINISTRADOR'] },
  { to: '/turmas', label: 'Turmas', icon: School, roles: ['ADMINISTRADOR'] },
  { to: '/disciplinas', label: 'Matérias', icon: BookOpen, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/matriculas', label: 'Alunos', icon: UserCheck, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/matriculas-turmas', label: 'Alunos / Turmas', icon: Users2, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/avaliacoes', label: 'Avaliações', icon: ClipboardList, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/notas', label: 'Notas', icon: PenLine, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/frequencias', label: 'Frequências', icon: CalendarCheck, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/boletim', label: 'Boletim', icon: FileText, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['ADMINISTRADOR', 'PROFESSOR'] },
]

export function Layout() {
  const { perfil, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nota</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {navItems
            .filter((item) => !item.roles || (perfil && item.roles.includes(perfil.tipo)))
            .map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            {perfil && (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  {perfil.matricula.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{perfil.matricula}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{perfil.tipo}</div>
                </div>
              </div>
            )}
            <button
              onClick={() => navigate('/senha')}
              title="Trocar senha"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <KeyRound className="h-5 w-5" />
            </button>
            <button
              onClick={toggle}
              title="Alternar tema"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleLogout}
              title="Sair"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
