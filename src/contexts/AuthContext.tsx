import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export type RoleGlobal = 'admin' | null
export type RoleProduit = 'po' | 'dev' | 'lecteur'

export interface UserProfile {
  user_id: string
  display_name: string | null
  role_global: RoleGlobal
}

export interface UserProduitRole {
  produit_id: number
  role: RoleProduit
}

interface AuthContextValue {
  user:        User | null
  profile:     UserProfile | null
  roles:       UserProduitRole[]
  isAdmin:     boolean
  isLoading:   boolean
  getRoleForProduit: (produitId: number) => RoleProduit | null
  canEdit:     (produitId: number) => boolean   // admin ou po
  canWrite:    (produitId: number) => boolean   // admin, po ou dev
}

const AuthContext = createContext<AuthContextValue>({
  user: null, profile: null, roles: [], isAdmin: false, isLoading: true,
  getRoleForProduit: () => null, canEdit: () => false, canWrite: () => false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roles,   setRoles]   = useState<UserProduitRole[]>([])
  const [loading, setLoading] = useState(true)

  async function loadProfile(u: User) {
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', u.id)
      .single()

    if (prof) {
      setProfile(prof)
    } else {
      // Créer le profil à la première connexion
      const newProfile: UserProfile = { user_id: u.id, display_name: u.email ?? null, role_global: null }
      await supabase.from('user_profiles').insert(newProfile)
      setProfile(newProfile)
    }

    const { data: r } = await supabase
      .from('user_produit_roles')
      .select('produit_id, role')
      .eq('user_id', u.id)

    setRoles(r ?? [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (u) loadProfile(u).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u).finally(() => setLoading(false))
      else { setProfile(null); setRoles([]); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = profile?.role_global === 'admin'

    function getRoleForProduit(produitId: number): RoleProduit | null {
      if (isAdmin) return 'po' // admin a tous les droits
      return roles.find(r => r.produit_id === produitId)?.role ?? null
    }

    return {
      user, profile, roles, isAdmin, isLoading: loading,
      getRoleForProduit,
      canEdit:  (pid) => isAdmin || getRoleForProduit(pid) === 'po',
      canWrite: (pid) => isAdmin || ['po', 'dev'].includes(getRoleForProduit(pid) ?? ''),
    }
  }, [user, profile, roles, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
