import { useToastStore } from '@/hooks/useToast'

export function handleSupabaseError(error: unknown, context?: string): void {
  const toast = useToastStore.getState().show
  
  if (!error) return
  
  const err = error as { message?: string; code?: string; status?: number }
  
  // Erreurs réseau
  if (!navigator.onLine) {
    toast('Pas de connexion internet — vérifiez votre réseau', 'error')
    return
  }
  
  // Erreurs Supabase connues
  if (err.status === 403) {
    toast('Accès refusé — vérifiez les permissions Supabase (RLS)', 'error')
    return
  }
  if (err.status === 406) {
    toast('Aucune donnée trouvée', 'info')
    return
  }
  if (err.status === 409) {
    toast('Conflit — cette valeur existe déjà', 'error')
    return
  }
  if (err.code === '23505') {
    toast('Cette valeur existe déjà (doublon)', 'error')
    return
  }
  if (err.code === '23503') {
    toast('Référence invalide — vérifiez les données liées', 'error')
    return
  }
  
  // Timeout
  if (err.message?.includes('timeout') || err.message?.includes('fetch')) {
    toast(`Timeout réseau${context ? ` (${context})` : ''} — réessayez`, 'error')
    return
  }
  
  // Erreur générique
  toast(
    `Erreur${context ? ` (${context})` : ''}: ${err.message ?? 'Inconnue'}`,
    'error'
  )
}

// Hook wrapper pour les mutations React Query
export function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  return fn().catch(err => {
    handleSupabaseError(err, context)
    throw err
  })
}
