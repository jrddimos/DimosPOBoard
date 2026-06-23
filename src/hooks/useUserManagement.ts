import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { UserProfile, UserProduitRole, RoleProduit } from '@/contexts/AuthContext'

// ── Tous les profils (admin seulement) ────────────────────────
async function fetchAllProfiles(): Promise<(UserProfile & { email?: string })[]> {
  const { data, error } = await supabase.from('user_profiles').select('*')
  if (error) throw error
  return data ?? []
}

export function useAllProfiles() {
  return useQuery({ queryKey: ['user_profiles'], queryFn: fetchAllProfiles, staleTime: 30_000 })
}

// ── Tous les droits produit ───────────────────────────────────
async function fetchAllRoles(): Promise<(UserProduitRole & { user_id: string })[]> {
  const { data, error } = await supabase.from('user_produit_roles').select('*')
  if (error) throw error
  return data ?? []
}

export function useAllRoles() {
  return useQuery({ queryKey: ['user_produit_roles'], queryFn: fetchAllRoles, staleTime: 30_000 })
}

// ── Inviter un utilisateur (Supabase Admin API via edge function) ──
export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      email,
      display_name,
      role_global,
      produit_roles,
    }: {
      email: string
      display_name: string
      role_global?: 'admin' | null
      produit_roles?: Record<number, RoleProduit>
    }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, display_name },
      })
      if (error) {
        // Extraire le message réel de la Edge Function
        let msg = error.message
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new Error(msg)
      }

      const userId: string | undefined = data?.user?.id
      if (userId) {
        if (role_global === 'admin') {
          await supabase.from('user_profiles').upsert(
            { user_id: userId, display_name: display_name || email, role_global: 'admin' },
            { onConflict: 'user_id' }
          )
        }
        if (produit_roles) {
          for (const [produitIdStr, role] of Object.entries(produit_roles)) {
            await supabase.from('user_produit_roles').upsert(
              { user_id: userId, produit_id: Number(produitIdStr), role },
              { onConflict: 'user_id,produit_id' }
            )
          }
        }
      }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['user_produit_roles'] })
    },
  })
}

// ── Mettre à jour le rôle global ─────────────────────────────
export function useSetRoleGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, role_global }: { user_id: string; role_global: 'admin' | null }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role_global })
        .eq('user_id', user_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_profiles'] }),
  })
}

// ── Upsert rôle produit ───────────────────────────────────────
export function useUpsertRoleProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, produit_id, role }: { user_id: string; produit_id: number; role: RoleProduit }) => {
      const { error } = await supabase
        .from('user_produit_roles')
        .upsert({ user_id, produit_id, role }, { onConflict: 'user_id,produit_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_produit_roles'] }),
  })
}

// ── Supprimer rôle produit ────────────────────────────────────
export function useDeleteRoleProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, produit_id }: { user_id: string; produit_id: number }) => {
      const { error } = await supabase
        .from('user_produit_roles')
        .delete()
        .eq('user_id', user_id)
        .eq('produit_id', produit_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_produit_roles'] }),
  })
}

// ── Supprimer un utilisateur ──────────────────────────────────
export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from('user_profiles').delete().eq('user_id', user_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['user_produit_roles'] })
    },
  })
}
