import { useState } from 'react'
import { Layout } from '@/components/layout/Layout'
import { useAllProfiles, useAllRoles, useInviteUser, useSetRoleGlobal, useUpsertRoleProduit, useDeleteRoleProduit, useDeleteUser } from '@/hooks/useUserManagement'
import { useProduits } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import type { RoleProduit } from '@/contexts/AuthContext'
import { UserPlus, Shield, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLE_COLORS: Record<RoleProduit, string> = {
  po:      'bg-navy/10 text-navy',
  dev:     'bg-green/10 text-green',
  lecteur: 'bg-subtle/10 text-subtle',
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const toast         = useToast()

  const { data: profiles = [], isLoading: loadingProfiles } = useAllProfiles()
  const { data: allRoles = [], isLoading: loadingRoles }   = useAllRoles()
  const { data: produits = [] }                            = useProduits()

  const inviteUser     = useInviteUser()
  const setRoleGlobal  = useSetRoleGlobal()
  const upsertRole     = useUpsertRoleProduit()
  const deleteRole     = useDeleteRoleProduit()
  const deleteUser     = useDeleteUser()

  const [showInvite, setShowInvite]     = useState(false)
  const [email, setEmail]               = useState('')
  const [displayName, setDisplayName]   = useState('')
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false)
  const [inviteProduitRoles, setInviteProduitRoles] = useState<Record<number, RoleProduit | 'none'>>({})

  function setInviteProduitRole(produitId: number, role: RoleProduit | 'none') {
    setInviteProduitRoles(prev => ({ ...prev, [produitId]: role }))
  }

  function resetInviteForm() {
    setEmail(''); setDisplayName(''); setInviteIsAdmin(false); setInviteProduitRoles({}); setShowInvite(false)
  }

  const produitsActifs = produits.filter(p => p.actif)

  function getRoleForUser(userId: string, produitId: number): RoleProduit | null {
    return (allRoles.find(r => r.user_id === userId && r.produit_id === produitId)?.role ?? null) as RoleProduit | null
  }

  async function handleInvite() {
    if (!email.trim()) { toast('Email obligatoire', 'error'); return }
    const produitRolesFiltered = Object.fromEntries(
      Object.entries(inviteProduitRoles)
        .filter(([, r]) => r !== 'none')
        .map(([id, r]) => [id, r as RoleProduit])
    ) as Record<number, RoleProduit>
    try {
      await inviteUser.mutateAsync({
        email: email.trim(),
        display_name: displayName.trim() || email.trim(),
        role_global: inviteIsAdmin ? 'admin' : null,
        produit_roles: Object.keys(produitRolesFiltered).length ? produitRolesFiltered : undefined,
      })
      toast(`Invitation envoyée à ${email}`)
      resetInviteForm()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'invitation'
      toast(msg, 'error')
    }
  }

  async function handleRoleGlobal(userId: string, current: 'admin' | null) {
    await setRoleGlobal.mutateAsync({ user_id: userId, role_global: current === 'admin' ? null : 'admin' })
    toast(current === 'admin' ? 'Droits admin retirés' : 'Droits admin accordés')
  }

  async function handleRoleProduit(userId: string, produitId: number, role: RoleProduit | 'none') {
    if (role === 'none') {
      await deleteRole.mutateAsync({ user_id: userId, produit_id: produitId })
    } else {
      await upsertRole.mutateAsync({ user_id: userId, produit_id: produitId, role })
    }
  }

  async function handleDeleteUser(userId: string, name: string) {
    if (!window.confirm(`Supprimer l'utilisateur "${name}" ?`)) return
    await deleteUser.mutateAsync(userId)
    toast(`"${name}" supprimé`)
  }

  if (loadingProfiles || loadingRoles) return (
    <div className="min-h-screen flex items-center justify-center bg-bg"><Spinner /></div>
  )

  return (
    <Layout title="Gestion utilisateurs" actions={
      <div className="flex items-center gap-2">
        <button onClick={() => setShowInvite(s => !s)}
          className={cn('ds-btn-primary ds-btn-sm flex items-center gap-1.5', showInvite && 'opacity-60')}>
          <UserPlus size={13} /> Inviter
        </button>
      </div>
    }>
      {/* Formulaire invitation */}
      {showInvite && (
        <div className="bg-white rounded-2xl border border-purple/30 p-5 mb-6 shadow-sm">
          <div className="text-sm font-semibold text-navy mb-4 flex items-center gap-2">
            <UserPlus size={15} className="text-purple" /> Inviter un utilisateur
          </div>

          {/* Identité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="ds-label mb-1 block">Email *</label>
              <input value={email} onChange={e => setEmail(e.target.value)} className="ds-input"
                placeholder="prenom.nom@exemple.fr" type="email" autoFocus />
            </div>
            <div>
              <label className="ds-label mb-1 block">Nom affiché</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="ds-input"
                placeholder="Prénom Nom" />
            </div>
          </div>

          {/* Rôle global */}
          <div className="mb-4">
            <div className="ds-label mb-2">Rôle global</div>
            <div className="flex gap-2">
              {[
                { val: false, label: 'Utilisateur standard', desc: 'Accès limité aux produits assignés' },
                { val: true,  label: 'Administrateur',       desc: 'Accès complet à tous les produits et paramètres' },
              ].map(opt => (
                <button key={String(opt.val)} type="button"
                  onClick={() => setInviteIsAdmin(opt.val)}
                  className={cn(
                    'flex-1 text-left px-3 py-2.5 rounded-xl border text-xs transition-all',
                    inviteIsAdmin === opt.val
                      ? 'border-purple bg-purple/5 text-purple'
                      : 'border-border text-subtle hover:border-navy/30 hover:text-navy'
                  )}>
                  <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                    {opt.val && <Shield size={11} />} {opt.label}
                  </div>
                  <div className="text-[11px] opacity-70">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Rôles par produit (uniquement si non admin) */}
          {!inviteIsAdmin && produitsActifs.length > 0 && (
            <div className="mb-4">
              <div className="ds-label mb-2">Accès produits</div>
              <div className="flex flex-col gap-2">
                {produitsActifs.map(p => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-40 shrink-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                      <span className="text-xs font-medium text-navy truncate">{p.nom}</span>
                    </div>
                    <select
                      value={inviteProduitRoles[p.id] ?? 'none'}
                      onChange={e => setInviteProduitRole(p.id, e.target.value as RoleProduit | 'none')}
                      className="ds-select text-xs py-1 w-40">
                      <option value="none">— Aucun accès —</option>
                      <option value="po">PO</option>
                      <option value="dev">Développeur</option>
                      <option value="lecteur">Lecteur</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1 border-t border-border">
            <button onClick={handleInvite} disabled={inviteUser.isPending || !email.trim()}
              className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
              <UserPlus size={13} />
              {inviteUser.isPending ? 'Envoi…' : 'Envoyer l\'invitation'}
            </button>
            <button onClick={resetInviteForm} className="ds-btn ds-btn-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* Tableau utilisateurs */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle uppercase tracking-wide">Utilisateur</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-subtle uppercase tracking-wide">Admin</th>
                {produitsActifs.map(p => (
                  <th key={p.id} className="text-left px-3 py-3 text-xs font-semibold text-subtle uppercase tracking-wide whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.couleur ?? '#4A4CC8' }} />
                      {p.nom}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={3 + produitsActifs.length} className="text-center py-10 text-subtle text-sm">
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              ) : profiles.map(p => (
                <tr key={p.user_id} className={cn('hover:bg-bg/30 transition-colors', p.user_id === me?.id && 'bg-purple/5')}>
                  {/* Nom */}
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-navy">{p.display_name}</div>
                    {p.user_id === me?.id && (
                      <div className="text-xs text-purple font-semibold">Vous</div>
                    )}
                  </td>

                  {/* Admin toggle */}
                  <td className="px-3 py-3.5">
                    <button
                      onClick={() => handleRoleGlobal(p.user_id, p.role_global)}
                      disabled={p.user_id === me?.id}
                      title={p.user_id === me?.id ? 'Impossible de modifier votre propre rôle admin' : ''}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors',
                        p.role_global === 'admin'
                          ? 'bg-purple/10 text-purple hover:bg-purple/20'
                          : 'text-subtle hover:bg-bg',
                        p.user_id === me?.id && 'opacity-40 cursor-not-allowed'
                      )}>
                      <Shield size={11} />
                      {p.role_global === 'admin' ? 'Admin' : 'Non'}
                    </button>
                  </td>

                  {/* Rôle par produit */}
                  {produitsActifs.map(prod => {
                    const currentRole = getRoleForUser(p.user_id, prod.id)
                    return (
                      <td key={prod.id} className="px-3 py-3.5">
                        {p.role_global === 'admin' ? (
                          <span className="text-xs text-subtle italic">Admin</span>
                        ) : (
                          <div className="relative">
                            <select
                              value={currentRole ?? 'none'}
                              onChange={e => handleRoleProduit(p.user_id, prod.id, e.target.value as RoleProduit | 'none')}
                              className={cn(
                                'text-xs font-semibold px-2 py-1 pr-5 rounded-lg border-0 appearance-none cursor-pointer focus:outline-none transition-colors',
                                currentRole ? ROLE_COLORS[currentRole] : 'text-subtle bg-transparent'
                              )}>
                              <option value="none">— Aucun —</option>
                              <option value="po">PO</option>
                              <option value="dev">Dev</option>
                              <option value="lecteur">Lecteur</option>
                            </select>
                          </div>
                        )}
                      </td>
                    )
                  })}

                  {/* Actions */}
                  <td className="px-3 py-3.5 text-right">
                    {p.user_id !== me?.id && (
                      <button onClick={() => handleDeleteUser(p.user_id, p.display_name ?? '')}
                        className="p-1.5 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ToastContainer />
    </Layout>
  )
}
