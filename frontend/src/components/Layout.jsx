import { useState } from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LayoutDashboard, Send, LogOut, Scissors, Settings, Image, Calendar, Trash2, BarChart2, Bell } from 'lucide-react'

export default function Layout({ onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Kanban', path: '/' },
    { icon: BarChart2, label: 'Dashboard', path: '/dashboard' },
    { icon: Calendar, label: 'Calendário', path: '/calendar' },
    { icon: Send, label: 'Envio em Massa', path: '/mass-message' },
    { icon: Image, label: 'Mídias', path: '/media' },
    { icon: Trash2, label: 'Leads Excluídos', path: '/deleted-leads' },
    { icon: Settings, label: 'Configurações', path: '/settings' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${
        collapsed ? 'w-16' : 'w-56'
      } bg-white border-r border-gray-100 flex flex-col transition-all duration-200 sticky top-0 h-screen z-40`}>

        {/* Header do Sidebar */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <Scissors className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-bold text-gray-800">ConvertHair</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-100 rounded transition text-gray-400"
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded transition ${
                  isActive(item.path)
                    ? 'bg-teal-700 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={collapsed ? item.label : ''}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 space-y-1">
          <Link
            to="/alert-rules"
            className={`flex items-center gap-3 px-3 py-2 rounded transition ${
              location.pathname === '/alert-rules'
                ? 'bg-teal-700 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={collapsed ? 'Regras de Alertas' : ''}
          >
            <Bell className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Regras de Alertas</span>}
          </Link>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded transition text-sm font-medium"
            title={collapsed ? 'Sair' : ''}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
