import { create } from 'zustand'

const LS_KEY = 'dimos-dark-mode'

function getInitial(): boolean {
  return localStorage.getItem(LS_KEY) === '1'
}

interface DarkModeState {
  dark: boolean
  toggle: () => void
}

export const useDarkModeStore = create<DarkModeState>((set) => ({
  dark: getInitial(),
  toggle: () => set(s => {
    const next = !s.dark
    localStorage.setItem(LS_KEY, next ? '1' : '0')
    return { dark: next }
  }),
}))
