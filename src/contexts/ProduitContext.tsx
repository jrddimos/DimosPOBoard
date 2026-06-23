import { createContext, useContext, useState } from 'react'

export interface ProduitActif {
  id:      number
  nom:     string
  couleur: string | null
}

interface ProduitContextValue {
  produitActif:    ProduitActif | null
  setProduitActif: (p: ProduitActif | null) => void
}

const ProduitContext = createContext<ProduitContextValue>({
  produitActif: null,
  setProduitActif: () => {},
})

const LS_KEY = 'dimos_produit_actif'

export function ProduitProvider({ children }: { children: React.ReactNode }) {
  const [produitActif, setProduitActifState] = useState<ProduitActif | null>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  function setProduitActif(p: ProduitActif | null) {
    setProduitActifState(p)
    if (p) localStorage.setItem(LS_KEY, JSON.stringify(p))
    else localStorage.removeItem(LS_KEY)
  }

  return (
    <ProduitContext.Provider value={{ produitActif, setProduitActif }}>
      {children}
    </ProduitContext.Provider>
  )
}

export function useProduit() {
  return useContext(ProduitContext)
}
