import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ActivityLog {
  id: string
  timestamp: string
  action: 'create' | 'update' | 'delete' | 'status'
  target: string      // id_tache
  title: string       // titre tâche
  field?: string      // champ modifié
  oldValue?: string
  newValue?: string
}

interface ActivityState {
  logs: ActivityLog[]
  add: (log: Omit<ActivityLog,'id'|'timestamp'>) => void
  clear: () => void
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      logs: [],
      add: (log) => set(s => ({
        logs: [{
          ...log,
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
        }, ...s.logs].slice(0, 200), // Garder 200 dernières
      })),
      clear: () => set({ logs: [] }),
    }),
    { name: 'dimos-activity-log' }
  )
)

export const useActivity = () => useActivityStore(s => s.add)
