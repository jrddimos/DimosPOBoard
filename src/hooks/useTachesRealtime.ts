import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'

// Pousse en direct les modifications de `taches` faites par d'autres
// utilisateurs — sans ça, chacun ne voyait les changements des autres qu'au
// prochain refetch (staleTime 30s + refocus), jamais pendant qu'un panneau
// de détail reste ouvert. v1 volontairement simple : invalidation générique
// plutôt que patch direct du cache (plus robuste, un peu de latence en plus
// le temps du refetch — largement suffisant face au refresh manuel d'avant).
// `predicate` sur le préfixe 'taches' couvre `useTaches`/`useAllTaches`/
// `useTachesByProduit` en un seul coup (elles partagent ce préfixe de clé).
export function useTachesRealtime() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null
  const qc = useQueryClient()

  useEffect(() => {
    if (!produitId) return
    const channel = supabase
      .channel(`taches-produit-${produitId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'taches', filter: `produit_id=eq.${produitId}` },
        () => qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'taches' }),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [produitId, qc])
}
