import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RunningTimer {
  id_tache:   string
  titre:      string
  produit_id: number
  started_at: string // ISO
}

interface TimerState {
  running: RunningTimer | null
  start: (t: RunningTimer) => void
  stop: () => void
}

// Persisté : si l'utilisateur ferme l'onglet en oubliant d'arrêter le
// chrono, il le retrouve toujours en cours à la reconnexion, avec le
// vrai temps écoulé (started_at ne bouge pas).
export const useTimerStore = create<TimerState>()(
  persist(
    (set) => ({
      running: null,
      start: (t) => set({ running: t }),
      stop: () => set({ running: null }),
    }),
    { name: 'dimos-running-timer' }
  )
)

export function elapsedMinutes(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000))
}

export function formatElapsed(startedAt: string): string {
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}
