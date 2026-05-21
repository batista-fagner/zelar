import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import KanbanPage from './pages/KanbanPage'
import BulkMessagePage from './pages/BulkMessagePage'
import SettingsPage from './pages/SettingsPage'
import MediaPage from './pages/MediaPage'
import CalendarPage from './pages/CalendarPage'
import DeletedLeadsPage from './pages/DeletedLeadsPage'
import DashboardPage from './pages/DashboardPage'
import AlertRulesPage from './pages/AlertRulesPage'
import Layout from './components/Layout'

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={!loggedIn ? <LoginPage onLogin={() => setLoggedIn(true)} /> : null}
        />
        <Route
          element={loggedIn ? <Layout onLogout={() => setLoggedIn(false)} /> : <LoginPage onLogin={() => setLoggedIn(true)} />}
        >
          <Route path="/" element={<KanbanPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/deleted-leads" element={<DeletedLeadsPage />} />
          <Route path="/mass-message" element={<BulkMessagePage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/alert-rules" element={<AlertRulesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
