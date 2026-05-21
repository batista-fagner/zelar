import { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import { getLeads } from '../services/api'

export function useLeads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLeads = useCallback(async () => {
    try {
      const data = await getLeads()
      setLeads(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeads()

    const socket = io(import.meta.env.VITE_API_URL ?? 'http://localhost:3000')

    socket.on('lead:updated', (updatedLead) => {
      setLeads((prev) => {
        const exists = prev.find((l) => l.id === updatedLead.id)
        if (exists) return prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
        return [updatedLead, ...prev]
      })
    })

    socket.on('lead:deleted', (leadId) => {
      setLeads((prev) => prev.filter((l) => l.id !== leadId))
    })

    return () => socket.disconnect()
  }, [fetchLeads])

  function updateLeadLocally(updatedLead) {
    setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? { ...l, ...updatedLead } : l)))
  }

  return { leads, setLeads, loading, refetch: fetchLeads, updateLeadLocally }
}
