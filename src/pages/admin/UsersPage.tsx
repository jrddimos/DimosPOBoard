import { useState } from 'react'
import { Layout } from '@/components/layout/Layout'
import {
  useAllProfiles, useAllRoles,
  useInviteUser, useSetRoleGlobal, useUpsertRoleProduit, useDeleteRoleProduit, useDeleteUser,
  usePendingProfiles, useCreatePendingProfile, useDeletePendingProfile, useSendInvitationToPending,
  type PendingProfile,
} from '@/hooks/useUserManagement'
import { useProduits } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import type { RoleProduit } from '@/contexts/AuthContext'
import { UserPlus, Shield, Trash2, Mail, Clock, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLE_COLORS: Record<RoleProduit, string> = {
  po:      'bg-navy/10 text-navy',
  dev:     'bg-green/10 text-green',
  lecteur: 'bg-subtle/10 text-subtle',
}

const COULEURS = ['#4A4CC8','#00C896','#F0A500','#EF4444','#8B5CF6','#0EA5E9','#F97316','#10B981']

export default function UsersPage() {
  const { user: me } = useAuth()
  const toast         = useToast()

  const { data: profiles = [],        isLoading: loadingProfiles } = useAllProfiles()
  const { data: allRoles = [],        isLoading: loadingRoles }    = useAllRoles()
  const { data: produits = [] }                                    = useProduits()
  const { data: pendingProfiles = [] }                             = usePendingProfiles()

  const inviteUser          = useInviteUser()
  const setRoleGlobal       = useSetRoleGlobal()
  const upsertRole          = useUpsertRoleProduit()
  const deleteRole          = useDeleteRoleProduit()
  const deleteUser          = useDeleteUser()
  const createPending       = useCreatePendingProfile()
  const deletePending       = useDeletePendingProfile()
  const sendInvitation      = useSendInvitationToPending()

  // ── Formulaire ────────────────────────────────────────────────
  const [showForm,     setShowForm]     = useState(false)
  const [formMode,     setFormMode]     = useState<'email' | 'pending'>('email')

  // Mode email (invitation immédiate)
  const [email,           setEmail]           = useState('')
  const [displayName,     setDisplayName]     = useState('')
  const [inviteIsAdmin,   setInviteIsAdmin]   = useState(false)
  const [inviteProduitRoles, setInviteProduitRoles] = useState<Record<number, RoleProduit | 'none'>>({})

  // Mode pending (sans email)
  const [pNom,          setPNom]          = useState('')
  const [pTrigramme,    setPTrigramme]    = useState('')
  const [pPrenom,       setPPrenom]       = useState('')
  const [pNomFamille,   setPNomFamille]   = useState('')
  const [pCouleur,      setPCouleur]      = useState(COULEURS[0])
  const [pIsAdmin,      setPIsAdmin]      = useState(false)

  // Invitation différée (pending → email)
  const [inviteTarget, setInviteTarget]   = useState<PendingProfile | null>(null)
  const [inviteEmail,  setInviteEmail]    = useState('')

  const produitsActifs = produits.filter(p => p.actif)

  function setInviteProduitRole(produitId: number, role: RoleProduit | 'none') {
    setInviteProduitRoles(prev => ({ ...prev, [produitId]: role }))
  }

  function resetForm() {
    setEmail(''); setDisplayName(''); setInviteIsAdmin(false); setInviteProduitRoles({})
    setPNom(''); setPTrigramme(''); setPPrenom(''); setPNomFamille('')
    setPCouleur(COULEURS[0]); setPIsAdmin(false)
    setShowForm(false)
  }

  function getRoleForUser(userId: string, produitId: number): RoleProduit | null {
    return (allRoles.find(r => r.user_id === userId && r.produit_id === produitId)?.role ?? null) as RoleProduit | null
  }

  // ── Handlers ──────────────────────────────────────────────────

  async function handleInviteNow() {
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
      resetForm()
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur lors de l'invitation", 'error')
    }
  }

  async function handleCreatePending() {
    if (!pNom.trim()) { toast('Nom affiché obligatoire', 'error'); return }
    try {
      await createPending.mutateAsync({
        display_name:        pNom.trim(),
        trigramme:           pTrigramme.trim().toUpperCase() || null,
        prenom:              pPrenom.trim() || null,
        nom:                 pNomFamille.trim() || null,
        couleur:             pCouleur,
        role_global:         pIsAdmin ? 'admin' : null,
        equipe_ids:           [],
        pending_produit_ids:  [],
        pending_produit_roles: {},
      })
      toast(`Profil "${pNom.trim()}" créé — invitation à envoyer plus tard`)
      resetForm()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur', 'error')
    }
  }

  async function handleSendInvitation() {
    if (!inviteTarget) return
    if (!inviteEmail.trim()) { toast('Email obligatoire', 'error'); return }
    try {
      await sendInvitation.mutateAsync({ pending: inviteTarget, email: inviteEmail.trim() })
      toast(`Invitation envoyée à ${inviteEmail}`)
      setInviteTarget(null); setInviteEmail('')
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur lors de l'invitation", 'error')
    }
  }

  async function handleRoleGlobal(userId: string, current: 'admin' | null) {
    await setRoleGlobal.mutateAsync({ user_id: userId, role_global: current === 'admin' ? null : 'admin' })
    toast(current === 'admin' ? 'Droits admin retirés' : 'Droits admin accordés')
  }

  async function handleRoleProduit(userId: string, produitId: number, role: RoleProduit | 'none') {
    if (role === 'none') await deleteRole.mutateAsync({ user_id: userId, produit_id: produitId })
    else await upsertRole.mutateAsync({ user_id: userId, produit_id: produitId, role })
  }

  async function handleDeleteUser(userId: string, name: string) {
    if (!window.confirm(`Supprimer l'utilisateur "${name}" ?`)) return
    await deleteUser.mutateAsync(userId)
    toast(`"${name}" supprimé`)
  }

  async function handleDeletePending(p: PendingProfile) {
    if (!window.confirm(`Supprimer le profil en attente "${p.display_name}" ?`)) return
    await deletePending.mutateAsync(p.id)
    toast(`"${p.display_name}" supprimé`)
  }

  if (loadingProfiles || loadingRoles) return (
    <div className="min-h-screen flex items-center justify-center bg-bg"><Spinner /></div>
  )

  return (
    <Layout title="Gestion utilisateurs" actions={
      <button onClick={() => setShowForm(s => !s)}
        className={cn('ds-btn-primary ds-btn-sm flex items-center gap-1.5', showForm && 'opacity-60')}>
        <UserPlus size={13} /> Ajouter un utilisateur
      </button>
    }>

      {/* ── Formulaire ───────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-purple/30 p-5 mb-6 shadow-sm">
          <div className="text-sm font-semibold text-navy mb-4 flex items-center gap-2">
            <UserPlus size={15} className="text-purple" /> Ajouter un utilisateur
          </div>

          {/* Toggle de mode */}
          <div className="flex gap-1 p-1 bg-bg rounded-xl mb-5 w-fit">
            {([
              { mode: 'email'   as const, label: 'Invitation par email', icon: <Mail size={12} /> },
              { mode: 'pending' as const, label: 'Créer sans email',     icon: <Clock size={12} /> },
            ]).map(opt => (
              <button key={opt.mode} onClick={() => setFormMode(opt.mode)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  formMode === opt.mode
                    ? 'bg-white shadow text-navy'
                    : 'text-subtle hover:text-navy'
                )}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {formMode === 'email' ? (
            /* ── Mode invitation immédiate ── */
            <>
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

              <div className="mb-4">
                <div className="ds-label mb-2">Rôle global</div>
                <div className="flex gap-2">
                  {[
                    { val: false, label: 'Utilisateur standard', desc: 'Accès limité aux produits assignés' },
                    { val: true,  label: 'Administrateur',       desc: 'Accès complet à tous les produits' },
                  ].map(opt => (
                    <button key={String(opt.val)} type="button" onClick={() => setInviteIsAdmin(opt.val)}
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
                        <select value={inviteProduitRoles[p.id] ?? 'none'}
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
                <button onClick={handleInviteNow} disabled={inviteUser.isPending || !email.trim()}
                  className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
                  <Send size={13} />
                  {inviteUser.isPending ? 'Envoi…' : "Envoyer l'invitation"}
                </button>
                <button onClick={resetForm} className="ds-btn ds-btn-sm">Annuler</button>
              </div>
            </>
          ) : (
            /* ── Mode profil sans email ── */
            <>
              <p className="text-xs text-subtle mb-4">
                Le profil sera créé immédiatement. L'utilisateur pourra être assigné à des produits et au plan de charges.
                Vous enverrez l'invitation par email quand vous serez prêt.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <label className="ds-label mb-1 block">Nom affiché *</label>
                  <input value={pNom} onChange={e => setPNom(e.target.value)} className="ds-input"
                    placeholder="Prénom Nom" autoFocus />
                </div>
                <div>
                  <label className="ds-label mb-1 block">Trigramme</label>
                  <input value={pTrigramme} onChange={e => setPTrigramme(e.target.value.toUpperCase().slice(0,3))}
                    className="ds-input uppercase tracking-widest" placeholder="ABC" maxLength={3} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="ds-label mb-1 block">Prénom</label>
                  <input value={pPrenom} onChange={e => setPPrenom(e.target.value)} className="ds-input" placeholder="Prénom" />
                </div>
                <div>
                  <label className="ds-label mb-1 block">Nom de famille</label>
                  <input value={pNomFamille} onChange={e => setPNomFamille(e.target.value)} className="ds-input" placeholder="Nom" />
                </div>
              </div>

              <div className="mb-4">
                <div className="ds-label mb-2">Couleur</div>
                <div className="flex gap-2 flex-wrap">
                  {COULEURS.map(c => (
                    <button key={c} type="button" onClick={() => setPCouleur(c)}
                      className={cn('w-7 h-7 rounded-full transition-all ring-offset-2',
                        pCouleur === c ? 'ring-2 ring-navy scale-110' : 'hover:scale-105')}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="ds-label mb-2">Rôle global</div>
                <div className="flex gap-2">
                  {[
                    { val: false, label: 'Utilisateur standard' },
                    { val: true,  label: 'Administrateur' },
                  ].map(opt => (
                    <button key={String(opt.val)} type="button" onClick={() => setPIsAdmin(opt.val)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                        pIsAdmin === opt.val
                          ? 'border-purple bg-purple/5 text-purple'
                          : 'border-border text-subtle hover:border-navy/30 hover:text-navy'
                      )}>
                      {opt.val && <Shield size={11} />} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1 border-t border-border">
                <button onClick={handleCreatePending} disabled={createPending.isPending || !pNom.trim()}
                  className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
                  <UserPlus size={13} />
                  {createPending.isPending ? 'Création…' : 'Créer le profil'}
                </button>
                <button onClick={resetForm} className="ds-btn ds-btn-sm">Annuler</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Profils en attente d'invitation ─────────────────── */}
      {pendingProfiles.length > 0 && (
        <div className="bg-orange/5 border border-orange/20 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-orange" />
            <span className="text-xs font-bold text-orange uppercase tracking-wider">
              En attente d'invitation ({pendingProfiles.length})
            </span>
          </div>
          <div className="space-y-2">
            {pendingProfiles.map(pp => (
              <div key={pp.id}
                className="flex flex-wrap items-center gap-3 bg-white rounded-xl px-4 py-2.5 border border-orange/10">
                {/* Avatar */}
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[10px] font-bold shrink-0"
                  style={{ background: pp.couleur ?? '#4A4CC8' }}>
                  {pp.trigramme ?? (pp.display_name.slice(0,2).toUpperCase())}
                </span>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-navy">{pp.display_name}</span>
                    {pp.trigramme && (
                      <span className="text-[10px] text-subtle font-mono bg-bg px-1.5 py-0.5 rounded">{pp.trigramme}</span>
                    )}
                    {pp.role_global === 'admin' && (
                      <span className="text-[10px] bg-purple/10 text-purple font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Shield size={9} /> Admin
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-subtle mt-0.5">Aucune invitation envoyée</div>
                </div>

                {/* Bouton invitation / formulaire inline */}
                {inviteTarget?.id === pp.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="adresse@email.fr"
                      type="email"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSendInvitation() }}
                      className="ds-input text-xs py-1.5 w-52"
                    />
                    <button onClick={handleSendInvitation}
                      disabled={sendInvitation.isPending || !inviteEmail.trim()}
                      className="ds-btn-primary ds-btn-sm flex items-center gap-1 text-xs">
                      <Send size={11} />
                      {sendInvitation.isPending ? 'Envoi…' : 'Envoyer'}
                    </button>
                    <button onClick={() => { setInviteTarget(null); setInviteEmail('') }}
                      className="ds-btn ds-btn-sm text-xs">Annuler</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setInviteTarget(pp); setInviteEmail('') }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-orange hover:bg-orange/10 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Mail size={12} /> Envoyer l'invitation
                  </button>
                )}

                {/* Supprimer */}
                <button onClick={() => handleDeletePending(pp)}
                  className="p-1.5 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tableau utilisateurs actifs ──────────────────────── */}
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
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-navy">{p.display_name}</div>
                    {p.user_id === me?.id && (
                      <div className="text-xs text-purple font-semibold">Vous</div>
                    )}
                  </td>

                  <td className="px-3 py-3.5">
                    <button onClick={() => handleRoleGlobal(p.user_id, p.role_global)}
                      disabled={p.user_id === me?.id}
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

                  {produitsActifs.map(prod => {
                    const currentRole = getRoleForUser(p.user_id, prod.id)
                    return (
                      <td key={prod.id} className="px-3 py-3.5">
                        {p.role_global === 'admin' ? (
                          <span className="text-xs text-subtle italic">Admin</span>
                        ) : (
                          <select value={currentRole ?? 'none'}
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
                        )}
                      </td>
                    )
                  })}

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
