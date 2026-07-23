import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/hooks/useActivityLog'
import type { UserProfile, UserProduitRole, RoleProduit } from '@/contexts/AuthContext'

// Nom affiché pour le journal (Setup > Global) — cherché dans le cache
// existant plutôt que refetché, ces mutations ne portent souvent que
// user_id (pas de display_name en argument, ex: useDeleteUser).
function userLabel(qc: QueryClient, user_id: string): string {
  const profile = qc.getQueryData<(UserProfile & { email?: string })[]>(['user_profiles'])?.find(p => p.user_id === user_id)
  return profile?.display_name || profile?.trigramme || user_id
}

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
        await logActivity({ produit_id: null, action: 'create', target: userId, title: display_name || email, entity: 'utilisateur' })
      }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['user_produit_roles'] })
    },
  })
}

// ── Créer un utilisateur avec mot de passe temporaire, sans email
// d'invitation (Admin API via edge function invite-user, action
// create_with_password) — contourne la rate-limit du service email par
// défaut de Supabase. Le mot de passe renvoyé est à communiquer hors bande
// par l'admin ; l'utilisateur devra le changer à sa première connexion
// (user_profiles.must_change_password, posé côté edge function). ──
export function useCreateUserWithPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      email, display_name, role_global, produit_roles,
    }: {
      email: string
      display_name: string
      role_global?: 'admin' | null
      produit_roles?: Record<number, RoleProduit>
    }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'create_with_password', email, display_name },
      })
      if (error) {
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
          await supabase.from('user_profiles').update({ role_global: 'admin' }).eq('user_id', userId)
        }
        if (produit_roles) {
          for (const [produitIdStr, role] of Object.entries(produit_roles)) {
            await supabase.from('user_produit_roles').upsert(
              { user_id: userId, produit_id: Number(produitIdStr), role },
              { onConflict: 'user_id,produit_id' }
            )
          }
        }
        await logActivity({ produit_id: null, action: 'create', target: userId, title: display_name || email, entity: 'utilisateur' })
      }
      return data as { user: { id: string; email: string }; password: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['user_produit_roles'] })
    },
  })
}

// ── Modifier l'email d'un utilisateur existant (Admin API via edge
// function invite-user, action update_email) ─────────────────────
export function useUpdateUserEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, email }: { user_id: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'update_email', user_id, email },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      await logActivity({ produit_id: null, action: 'update', target: user_id, title: userLabel(qc, user_id), field: 'email', entity: 'utilisateur' })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-emails'] }),
  })
}

// ── Mettre à jour le rôle global ─────────────────────────────
export function useSetRoleGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, role_global }: { user_id: string; role_global: 'admin' | null }) => {
      const current = qc.getQueryData<UserProfile[]>(['user_profiles'])?.find(p => p.user_id === user_id)
      const { error } = await supabase
        .from('user_profiles')
        .update({ role_global })
        .eq('user_id', user_id)
      if (error) throw error
      if (current?.role_global === role_global) return
      await logActivity({
        produit_id: null, action: 'update', target: user_id, title: userLabel(qc, user_id), field: 'role_global',
        old_value: JSON.stringify(current?.role_global ?? null), new_value: JSON.stringify(role_global), entity: 'utilisateur',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
  })
}

// ── Upsert rôle produit ───────────────────────────────────────
// Pas de undo (clé composite user_id+produit_id, pas de colonne id unique) —
// juste une trace pour l'audit, à corriger manuellement si besoin (il suffit
// de resélectionner le bon rôle dans le même écran).
export function useUpsertRoleProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, produit_id, role }: { user_id: string; produit_id: number; role: RoleProduit }) => {
      const { error } = await supabase
        .from('user_produit_roles')
        .upsert({ user_id, produit_id, role }, { onConflict: 'user_id,produit_id' })
      if (error) throw error
      await logActivity({ produit_id: null, action: 'update', target: user_id, title: `${userLabel(qc, user_id)} — rôle produit #${produit_id} = ${role}`, entity: 'utilisateur' })
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
      await logActivity({ produit_id: null, action: 'delete', target: user_id, title: `${userLabel(qc, user_id)} — rôle produit #${produit_id} retiré`, entity: 'utilisateur' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_produit_roles'] }),
  })
}

// ── Mettre à jour le profil (trigramme, prenom, equipe_id…) ──
export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, updates }: { user_id: string; updates: Partial<UserProfile> }) => {
      const current = qc.getQueryData<UserProfile[]>(['user_profiles'])?.find(p => p.user_id === user_id)
      const { error } = await supabase.from('user_profiles').update(updates).eq('user_id', user_id)
      if (error) throw error
      const title = current?.display_name || userLabel(qc, user_id)
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: null, action: 'update', target: user_id, title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'utilisateur',
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
  })
}

// ── Upload avatar ─────────────────────────────────────────────
export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, file }: { user_id: string; file: File | null }) => {
      if (file === null) {
        const { error } = await supabase.from('user_profiles').update({ avatar_url: null }).eq('user_id', user_id)
        if (error) throw error
        return null
      }
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${user_id}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatar_url = `${data.publicUrl}?t=${Date.now()}`
      const { error } = await supabase.from('user_profiles').update({ avatar_url }).eq('user_id', user_id)
      if (error) throw error
      return avatar_url
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
  })
}

// ── Modifier les équipes d'un utilisateur (multi-équipes) ─────
export function useSetUserEquipes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, equipe_ids }: { user_id: string; equipe_ids: number[] }) => {
      const current = qc.getQueryData<UserProfile[]>(['user_profiles'])?.find(p => p.user_id === user_id)
      const equipe_id = equipe_ids[0] ?? null
      const { error } = await supabase
        .from('user_profiles')
        .update({ equipe_ids, equipe_id })
        .eq('user_id', user_id)
      if (error) throw error
      if (JSON.stringify(current?.equipe_ids ?? []) === JSON.stringify(equipe_ids)) return
      await logActivity({
        produit_id: null, action: 'update', target: user_id, title: userLabel(qc, user_id), field: 'equipe_ids',
        old_value: JSON.stringify(current?.equipe_ids ?? []), new_value: JSON.stringify(equipe_ids), entity: 'utilisateur',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
  })
}

// ── Profils en attente d'invitation ──────────────────────────
export interface PendingProfile {
  id:                   number
  display_name:         string
  trigramme:            string | null
  prenom:               string | null
  nom:                  string | null
  couleur:              string | null
  role_global:          'admin' | null
  equipe_ids:           number[]
  pending_produit_ids:  number[]
  pending_produit_roles: Record<string, string>  // { "produit_id": "po"|"dev"|"lecteur" }
  created_at:           string
}

export function usePendingProfiles() {
  return useQuery({
    queryKey: ['pending_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pending_profiles').select('*').order('created_at')
      if (error) throw error
      return (data ?? []) as PendingProfile[]
    },
    staleTime: 30_000,
  })
}

export function useCreatePendingProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Omit<PendingProfile, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('pending_profiles').insert(p)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending_profiles'] }),
  })
}

export function useUpdatePendingProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Omit<PendingProfile, 'id' | 'created_at'>> }) => {
      // RPC SECURITY DEFINER — contourne le schema cache PostgREST pour les colonnes ALTER TABLE
      const { error } = await supabase.rpc('update_pending_profile_data', {
        p_id:   id,
        p_data: updates,
      })
      if (error) {
        console.error('[pending RPC] code:', error.code, '| msg:', error.message, '| details:', error.details)
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending_profiles'] }),
  })
}

/** @deprecated use useUpdatePendingProfile */
export function useUpdatePendingProduits() {
  const update = useUpdatePendingProfile()
  return { ...update, mutate: ({ id, pending_produit_ids }: { id: number; pending_produit_ids: number[] }) =>
    update.mutate({ id, updates: { pending_produit_ids } }) }
}

export function useDeletePendingProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('pending_profiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending_profiles'] }),
  })
}

export function useSendInvitationToPending() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pending, email }: { pending: PendingProfile; email: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: email.trim(), display_name: pending.display_name },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as unknown as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      const userId: string | undefined = (data as { user?: { id?: string } })?.user?.id
      if (userId) {
        await supabase.from('user_profiles').upsert({
          user_id:      userId,
          display_name: pending.display_name,
          trigramme:    pending.trigramme,
          prenom:       pending.prenom,
          nom:          pending.nom,
          couleur:      pending.couleur,
          role_global:  pending.role_global,
          equipe_ids:   pending.equipe_ids ?? [],
          equipe_id:    pending.equipe_ids?.[0] ?? null,
          actif:        true,
        }, { onConflict: 'user_id' })
        // Créer les rôles produits
        const roles = pending.pending_produit_roles ?? {}
        for (const [produitIdStr, role] of Object.entries(roles)) {
          await supabase.from('user_produit_roles').upsert(
            { user_id: userId, produit_id: Number(produitIdStr), role },
            { onConflict: 'user_id,produit_id' }
          )
        }
        await supabase.from('pending_profiles').delete().eq('id', pending.id)
        await logActivity({ produit_id: null, action: 'create', target: userId, title: pending.display_name, entity: 'utilisateur' })
      }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending_profiles'] })
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
    },
  })
}

// ── Convertir un profil en attente en compte réel, avec mot de passe
// temporaire plutôt qu'un email d'invitation (même contournement de la
// rate-limit email que useCreateUserWithPassword) — mode par défaut pour
// les profils en attente. ─────────────────────────────────────────
export function useCreatePendingWithPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pending, email }: { pending: PendingProfile; email: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'create_with_password', email: email.trim(), display_name: pending.display_name },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as unknown as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      const userId: string | undefined = (data as { user?: { id?: string } })?.user?.id
      const password: string | undefined = (data as { password?: string })?.password
      if (userId) {
        await supabase.from('user_profiles').upsert({
          user_id:      userId,
          display_name: pending.display_name,
          trigramme:    pending.trigramme,
          prenom:       pending.prenom,
          nom:          pending.nom,
          couleur:      pending.couleur,
          role_global:  pending.role_global,
          equipe_ids:   pending.equipe_ids ?? [],
          equipe_id:    pending.equipe_ids?.[0] ?? null,
          actif:        true,
        }, { onConflict: 'user_id' })
        const roles = pending.pending_produit_roles ?? {}
        for (const [produitIdStr, role] of Object.entries(roles)) {
          await supabase.from('user_produit_roles').upsert(
            { user_id: userId, produit_id: Number(produitIdStr), role },
            { onConflict: 'user_id,produit_id' }
          )
        }
        await supabase.from('pending_profiles').delete().eq('id', pending.id)
        await logActivity({ produit_id: null, action: 'create', target: userId, title: pending.display_name, entity: 'utilisateur' })
      }
      return { user: { id: userId, email: email.trim() }, password }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending_profiles'] })
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
    },
  })
}

// ── Supprimer un utilisateur ──────────────────────────────────
// Vraie suppression du compte auth (Admin API via edge function) — un
// simple DELETE sur user_profiles ne supprimait que le profil : le compte
// auth.users restait actif (login toujours possible) et un profil vide se
// recréait tout seul à la reconnexion (AuthContext.loadProfile). La cascade
// FK (user_produit_roles, user_profiles) est gérée côté base.
export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (user_id: string) => {
      const title = userLabel(qc, user_id)
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'delete_user', user_id },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      // Compte auth + profil supprimés côté edge function (cascade FK) — pas
      // de restauration possible depuis ce journal, juste une trace d'audit.
      await logActivity({ produit_id: null, action: 'delete', target: user_id, title, entity: 'utilisateur' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
      qc.invalidateQueries({ queryKey: ['user_produit_roles'] })
    },
  })
}

// ── Désactiver / réactiver un utilisateur ──────────────────────
// Bloque (ou débloque) la connexion via le ban Admin API — réversible,
// contrairement à la suppression. Synchronise aussi user_profiles.actif
// pour que le reste de l'app (Plan de charges, assignations…) cesse de le
// traiter comme un membre disponible tant qu'il est désactivé.
export function useSetUserBanned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, banned }: { user_id: string; banned: boolean }) => {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'set_banned', user_id, banned },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      const { error: profErr } = await supabase.from('user_profiles').update({ actif: !banned }).eq('user_id', user_id)
      if (profErr) throw profErr
      await logActivity({
        produit_id: null, action: 'update', target: user_id, title: userLabel(qc, user_id), field: 'actif',
        old_value: JSON.stringify(banned), new_value: JSON.stringify(!banned), entity: 'utilisateur',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
  })
}
