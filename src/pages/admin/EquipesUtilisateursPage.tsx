import { useState, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { useEquipes, useUtilisateurs, useCreateEquipe, useUpdateEquipe, useDeleteEquipe } from '@/hooks/useEquipes'
import { useAllRoles, useInviteUser, useSetRoleGlobal, useUpdateProfile, useSetUserEquipes, useUploadAvatar, useUpsertRoleProduit, useDeleteRoleProduit, useDeleteUser } from '@/hooks/useUserManagement'
import { useProduits } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { confirm } from '@/components/ui/ConfirmModal'
import { BRAND_COLORS } from '@/constants'
import type { RoleProduit, UserProfile } from '@/contexts/AuthContext'
import type { Equipe } from '@/types'
import { Plus, X, Pencil, Trash2, Users, UserPlus, Shield, ChevronDown, ChevronRight, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'

const ROLE_COLORS: Record<RoleProduit, string> = {
  po:      'bg-navy/10 text-navy',
  dev:     'bg-green/10 text-green',
  lecteur: 'bg-subtle/10 text-subtle',
}

// ── InlineEdit ─────────────────────────────────────────────────
function InlineEdit({ value, onSave, placeholder = '' }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  if (!editing) return (
    <button onClick={() => { setVal(value); setEditing(true) }}
      className="flex items-center gap-1 text-sm font-semibold text-navy hover:text-purple transition-colors group">
      {value || <span className="text-subtle italic">{placeholder}</span>}
      <Pencil size={11} className="opacity-0 group-hover:opacity-60" />
    </button>
  )
  return (
    <div className="flex items-center gap-1">
      <input value={val} onChange={e => setVal(e.target.value)} autoFocus
        className="ds-input py-0.5 text-sm font-semibold w-40"
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }} />
      <button onClick={() => { onSave(val); setEditing(false) }} className="p-1 rounded-lg bg-green/10 text-green hover:bg-green/20 text-xs">✓</button>
      <button onClick={() => setEditing(false)} className="p-1 rounded-lg bg-red/10 text-red hover:bg-red/20 text-xs">✕</button>
    </div>
  )
}

export default function EquipesUtilisateursPage() {
  const { user: me } = useAuth()
  const toast = useToast()

  const { data: equipes      = [], isLoading: loadEq } = useEquipes()
  const { data: utilisateurs = [], isLoading: loadU  } = useUtilisateurs()
  const { data: allRoles     = [] }                    = useAllRoles()
  const { data: produits     = [] }                    = useProduits()

  const createEquipe  = useCreateEquipe()
  const updateEquipe  = useUpdateEquipe()
  const deleteEquipe  = useDeleteEquipe()
  const updateProfile = useUpdateProfile()
  const setEquipes    = useSetUserEquipes()
  const inviteUser    = useInviteUser()
  const setRoleGlobal = useSetRoleGlobal()
  const upsertRole    = useUpsertRoleProduit()
  const deleteRole    = useDeleteRoleProduit()
  const deleteUser    = useDeleteUser()
  const uploadAvatar  = useUploadAvatar()

  // ── État UI ─────────────────────────────────────────────────
  const [newEquipeNom,    setNewEquipeNom]    = useState('')
  const [newEquipeCouleur, setNewEquipeCouleur] = useState(BRAND_COLORS[0])
  const [filterEquipe,   setFilterEquipe]    = useState<number | null>(null)
  const [search,         setSearch]          = useState('')
  const [showInvite,     setShowInvite]      = useState(false)
  const [editingUser,    setEditingUser]      = useState<string | null>(null)
  const [expandRoles,    setExpandRoles]      = useState<string | null>(null)

  const [inv, setInv] = useState({
    email: '', display_name: '', trigramme: '', prenom: '', nom: '',
    role_metier: '', couleur: BRAND_COLORS[0], isAdmin: false,
  })
  const [invEquipes, setInvEquipes] = useState<number[]>([])
  const [invRoles,   setInvRoles]   = useState<Record<number, RoleProduit | 'none'>>({})
  const [editForm,   setEditForm]   = useState({ trigramme: '', prenom: '', nom: '', role_metier: '', couleur: BRAND_COLORS[0] })

  if (loadEq || loadU) return <Layout><Spinner /></Layout>

  const produitsActifs   = produits.filter(p => p.actif)
  const equipesActives   = equipes.filter(e => e.actif)
  const equipeMap        = Object.fromEntries(equipes.map(e => [e.id, e])) as Record<number, Equipe>

  const usersFiltered = utilisateurs.filter(u => {
    if (!u.actif) return false
    if (filterEquipe !== null && !(u.equipe_ids ?? []).includes(filterEquipe)) return false
    if (search) {
      const q = search.toLowerCase()
      const match = [u.trigramme, u.prenom, u.nom, u.display_name, u.role_metier]
        .filter(Boolean).join(' ').toLowerCase()
      if (!match.includes(q)) return false
    }
    return true
  })

  // ── Équipes ─────────────────────────────────────────────────
  async function createEq() {
    if (!newEquipeNom.trim()) { toast('Nom obligatoire', 'error'); return }
    await createEquipe.mutateAsync({ nom: newEquipeNom.trim(), description: null, couleur: newEquipeCouleur, actif: true })
    toast(`Équipe "${newEquipeNom}" créée`); setNewEquipeNom('')
  }

  async function deleteEq(eq: Equipe) {
    const hasUsers = utilisateurs.some(u => (u.equipe_ids ?? []).includes(eq.id))
    if (!await confirm({
      title: "Supprimer l'équipe ?",
      message: hasUsers ? `${eq.nom} a des membres qui seront désaffectés.` : `${eq.nom} sera définitivement supprimée.`,
      confirmLabel: 'Supprimer', variant: 'danger',
    })) return
    // Retirer cette équipe de tous les utilisateurs membres
    for (const u of utilisateurs.filter(u => (u.equipe_ids ?? []).includes(eq.id))) {
      const newIds = (u.equipe_ids ?? []).filter(id => id !== eq.id)
      await setEquipes.mutateAsync({ user_id: u.user_id, equipe_ids: newIds })
    }
    await deleteEquipe.mutateAsync(eq.id)
    toast(`"${eq.nom}" supprimée`)
    if (filterEquipe === eq.id) setFilterEquipe(null)
  }

  // ── Assignation équipes ─────────────────────────────────────
  async function addToEquipe(user_id: string, equipe_id: number, current_ids: number[]) {
    if (current_ids.includes(equipe_id)) return
    await setEquipes.mutateAsync({ user_id, equipe_ids: [...current_ids, equipe_id] })
    toast(`Ajouté à ${equipeMap[equipe_id]?.nom}`)
  }

  async function removeFromEquipe(user_id: string, equipe_id: number, current_ids: number[]) {
    await setEquipes.mutateAsync({ user_id, equipe_ids: current_ids.filter(id => id !== equipe_id) })
    toast(`Retiré de ${equipeMap[equipe_id]?.nom}`)
  }

  // ── Edition profil ──────────────────────────────────────────
  function startEdit(u: UserProfile) {
    setEditingUser(u.user_id)
    setEditForm({ trigramme: u.trigramme ?? '', prenom: u.prenom ?? '', nom: u.nom ?? '', role_metier: u.role_metier ?? '', couleur: u.couleur ?? BRAND_COLORS[0] })
  }
  async function saveEdit(user_id: string) {
    await updateProfile.mutateAsync({ user_id, updates: {
      trigramme:   editForm.trigramme.toUpperCase() || null,
      prenom:      editForm.prenom || null,
      nom:         editForm.nom || null,
      role_metier: editForm.role_metier || null,
      couleur:     editForm.couleur || null,
    }})
    toast('Profil mis à jour'); setEditingUser(null)
  }

  async function toggleAdmin(user_id: string, current: 'admin' | null) {
    await setRoleGlobal.mutateAsync({ user_id, role_global: current === 'admin' ? null : 'admin' })
    toast(current === 'admin' ? 'Droits admin retirés' : 'Droits admin accordés')
  }

  function getRoleForUser(user_id: string, produit_id: number): RoleProduit | null {
    return (allRoles.find(r => r.user_id === user_id && r.produit_id === produit_id)?.role ?? null) as RoleProduit | null
  }

  async function handleRoleProduit(user_id: string, produit_id: number, role: RoleProduit | 'none') {
    if (role === 'none') await deleteRole.mutateAsync({ user_id, produit_id })
    else await upsertRole.mutateAsync({ user_id, produit_id, role })
  }

  async function handleDeleteUser(u: UserProfile) {
    const name = `${u.prenom ?? ''} ${u.nom ?? u.display_name ?? u.user_id}`.trim()
    if (!await confirm({ title: 'Supprimer l\'utilisateur ?', message: `"${name}" sera définitivement supprimé.`, confirmLabel: 'Supprimer', variant: 'danger' })) return
    await deleteUser.mutateAsync(u.user_id)
    toast(`"${name}" supprimé`)
  }

  // ── Invitation ───────────────────────────────────────────────
  function openInvite() {
    setInv({ email: '', display_name: '', trigramme: '', prenom: '', nom: '', role_metier: '', couleur: BRAND_COLORS[0], isAdmin: false })
    setInvEquipes(filterEquipe !== null ? [filterEquipe] : [])
    setInvRoles({})
    setShowInvite(true)
  }

  async function handleInvite() {
    if (!inv.email.trim()) { toast('Email obligatoire', 'error'); return }
    const roles = Object.fromEntries(
      Object.entries(invRoles).filter(([, r]) => r !== 'none').map(([id, r]) => [id, r as RoleProduit])
    ) as Record<number, RoleProduit>
    try {
      const res = await inviteUser.mutateAsync({
        email:        inv.email.trim(),
        display_name: inv.display_name.trim() || inv.email.trim(),
        role_global:  inv.isAdmin ? 'admin' : null,
        produit_roles: Object.keys(roles).length ? roles : undefined,
      })
      const userId: string | undefined = (res as { user?: { id: string } })?.user?.id
      if (userId) {
        await updateProfile.mutateAsync({ user_id: userId, updates: {
          trigramme:   inv.trigramme.toUpperCase() || null,
          prenom:      inv.prenom || null,
          nom:         inv.nom || null,
          role_metier: inv.role_metier || null,
          couleur:     inv.couleur || null,
        }})
        if (invEquipes.length > 0) {
          await setEquipes.mutateAsync({ user_id: userId, equipe_ids: invEquipes })
        }
      }
      toast(`Invitation envoyée à ${inv.email}`)
      setShowInvite(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur invitation', 'error')
    }
  }

  // ── Carte utilisateur ────────────────────────────────────────
  function UserCard({ u }: { u: UserProfile }) {
    const isEditing  = editingUser === u.user_id
    const isExpanded = expandRoles === u.user_id
    const isMe       = u.user_id === me?.id
    const displayName = [u.prenom, u.nom].filter(Boolean).join(' ') || u.display_name || '—'
    const fileRef = useRef<HTMLInputElement>(null)
    const userEquipeIds = u.equipe_ids ?? (u.equipe_id ? [u.equipe_id] : [])
    const teamsForUser  = userEquipeIds.map(id => equipeMap[id]).filter(Boolean)
    const teamsToAdd    = equipesActives.filter(e => !userEquipeIds.includes(e.id))

    return (
      <div className="flex flex-col bg-white rounded-xl border border-border overflow-hidden hover:border-purple/30 transition-colors">
        {/* Header */}
        <div className="flex items-start gap-2.5 p-3">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 mt-0.5">
            {u.avatar_url ? (
              <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: u.couleur ?? '#4A4CC8' }}>
                {u.trigramme ?? (displayName[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-navy truncate">{displayName}</span>
              {u.role_global === 'admin' && (
                <span className="text-[10px] font-bold text-purple bg-purple/10 px-1.5 py-0.5 rounded-full shrink-0">Admin</span>
              )}
              {isMe && (
                <span className="text-[10px] font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded-full shrink-0">Vous</span>
              )}
            </div>
            <div className="text-xs text-subtle">{u.role_metier || '—'}{u.trigramme ? ` · ${u.trigramme}` : ''}</div>

            {/* Chips équipes */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {teamsForUser.map(eq => (
                <span key={eq.id}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: (eq.couleur ?? '#4A4CC8') + '22', color: eq.couleur ?? '#4A4CC8' }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: eq.couleur ?? '#4A4CC8' }} />
                  {eq.nom}
                  <button onClick={() => removeFromEquipe(u.user_id, eq.id, userEquipeIds)}
                    className="ml-0.5 hover:opacity-60 transition-opacity shrink-0">
                    <X size={8} />
                  </button>
                </span>
              ))}
              {teamsForUser.length === 0 && (
                <span className="text-[10px] text-subtle italic">Sans équipe</span>
              )}
              {/* Ajouter une équipe */}
              {teamsToAdd.length > 0 && (
                <select
                  value=""
                  onChange={e => { if (e.target.value) addToEquipe(u.user_id, Number(e.target.value), userEquipeIds) }}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-dashed border-border bg-bg text-subtle cursor-pointer focus:outline-none hover:border-purple/50 appearance-none">
                  <option value="">+ équipe</option>
                  {teamsToAdd.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => isEditing ? setEditingUser(null) : startEdit(u)}
              className={cn('p-1.5 rounded hover:bg-bg text-subtle hover:text-navy transition-colors', isEditing && 'bg-bg text-navy')}>
              <Pencil size={12} />
            </button>
            {!isMe && (
              <>
                <button onClick={() => toggleAdmin(u.user_id, u.role_global)}
                  title={u.role_global === 'admin' ? 'Retirer admin' : 'Donner admin'}
                  className={cn('p-1.5 rounded transition-colors',
                    u.role_global === 'admin'
                      ? 'bg-purple/15 text-purple hover:bg-red/10 hover:text-red'
                      : 'text-subtle hover:bg-purple/10 hover:text-purple')}>
                  <Shield size={12} />
                </button>
                <button onClick={() => handleDeleteUser(u)}
                  className="p-1.5 rounded hover:bg-red/10 text-subtle hover:text-red transition-colors">
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Edition profil */}
        {isEditing && (
          <div className="px-3 pb-3 border-t border-border/60 bg-bg flex flex-col gap-2 pt-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="ds-label mb-1">Trigramme</div>
                <input value={editForm.trigramme} onChange={e => setEditForm(f => ({ ...f, trigramme: e.target.value.toUpperCase() }))}
                  className="ds-input text-sm" maxLength={4} placeholder="JDU" />
              </div>
              <div>
                <div className="ds-label mb-1">Prénom</div>
                <input value={editForm.prenom} onChange={e => setEditForm(f => ({ ...f, prenom: e.target.value }))} className="ds-input text-sm" />
              </div>
              <div>
                <div className="ds-label mb-1">Nom</div>
                <input value={editForm.nom} onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))} className="ds-input text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 items-start">
              <div>
                <div className="ds-label mb-1">Rôle métier</div>
                <input value={editForm.role_metier} onChange={e => setEditForm(f => ({ ...f, role_metier: e.target.value }))}
                  className="ds-input text-sm" placeholder="PO, BE…" />
              </div>
            </div>

            {/* Avatar picker */}
            <div>
              <div className="ds-label mb-2">Avatar</div>
              <div className="flex items-center gap-3">
                {/* Prévisualisation */}
                <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 cursor-pointer group"
                  onClick={() => fileRef.current?.click()}>
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: editForm.couleur ?? '#4A4CC8' }}>
                      {editForm.trigramme || (displayName[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera size={14} className="text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {/* Palette de couleurs */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {BRAND_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditForm(f => ({ ...f, couleur: c }))}
                        className={cn('w-4 h-4 rounded-full transition-transform hover:scale-110', editForm.couleur === c && 'ring-2 ring-navy ring-offset-1')}
                        style={{ background: c }} />
                    ))}
                  </div>
                  {/* Actions photo */}
                  <div className="flex gap-1.5 flex-wrap">
                    <button type="button" onClick={() => fileRef.current?.click()}
                      disabled={uploadAvatar.isPending}
                      className="ds-btn ds-btn-sm flex items-center gap-1 text-xs">
                      <Camera size={11} /> {uploadAvatar.isPending ? 'Upload…' : 'Changer la photo'}
                    </button>
                    {u.avatar_url && (
                      <button type="button"
                        onClick={async () => { await uploadAvatar.mutateAsync({ user_id: u.user_id, file: null }); toast('Photo supprimée') }}
                        className="ds-btn ds-btn-sm text-red hover:bg-red/10 flex items-center gap-1 text-xs">
                        <X size={11} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*,image/webp" className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  await uploadAvatar.mutateAsync({ user_id: u.user_id, file })
                  toast('Photo mise à jour')
                  e.target.value = ''
                }} />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingUser(null)} className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={() => saveEdit(u.user_id)} disabled={updateProfile.isPending} className="ds-btn-primary ds-btn-sm">Enregistrer</button>
            </div>
          </div>
        )}

        {/* Accès produits */}
        {u.role_global !== 'admin' && produitsActifs.length > 0 && (
          <div className="border-t border-border/40">
            <button onClick={() => setExpandRoles(isExpanded ? null : u.user_id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-subtle hover:text-navy transition-colors">
              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Accès produits
            </button>
            {isExpanded && (
              <div className="px-3 pb-2 flex flex-col gap-1">
                {produitsActifs.map(p => {
                  const current = getRoleForUser(u.user_id, p.id)
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                      <span className="text-xs text-navy flex-1 truncate">{p.nom}</span>
                      <select value={current ?? 'none'}
                        onChange={e => handleRoleProduit(u.user_id, p.id, e.target.value as RoleProduit | 'none')}
                        className={cn('text-xs font-semibold px-1.5 py-0.5 rounded-lg border-0 appearance-none cursor-pointer focus:outline-none',
                          current ? ROLE_COLORS[current] : 'text-subtle bg-transparent')}>
                        <option value="none">— Aucun —</option>
                        <option value="po">PO</option>
                        <option value="dev">Dev</option>
                        <option value="lecteur">Lecteur</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout>
      <ToastContainer />

      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-6 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-navy" />
          <h1 className="text-sm font-semibold text-navy">Équipes & Utilisateurs</h1>
        </div>
        <button onClick={openInvite} className="ml-auto ds-btn-primary ds-btn-sm flex items-center gap-1.5">
          <UserPlus size={13} /> Inviter un utilisateur
        </button>
      </div>

      {/* Layout principal : gauche équipes / droite utilisateurs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ── Colonne gauche : Équipes ─────────────────────── */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">

          {/* Créer une équipe */}
          <div className="ds-card">
            <div className="ds-card-title">Nouvelle équipe</div>
            <div className="flex flex-col gap-2">
              <input value={newEquipeNom} onChange={e => setNewEquipeNom(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createEq() }}
                className="ds-input" placeholder="Nom de l'équipe…" />
              <div className="flex gap-1.5 flex-wrap">
                {BRAND_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewEquipeCouleur(c)}
                    className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110', newEquipeCouleur === c && 'ring-2 ring-navy ring-offset-1')}
                    style={{ background: c }} />
                ))}
              </div>
              <button onClick={createEq} disabled={createEquipe.isPending} className="ds-btn-primary flex items-center gap-1">
                <Plus size={13} /> Créer
              </button>
            </div>
          </div>

          {/* Liste des équipes */}
          <div className="ds-card">
            <div className="ds-card-title">
              Équipes ({equipesActives.length})
              {filterEquipe !== null && (
                <button onClick={() => setFilterEquipe(null)} className="ml-auto text-xs text-subtle hover:text-navy flex items-center gap-1">
                  <X size={10} /> Tout afficher
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {equipesActives.map(eq => {
                const nb = utilisateurs.filter(u => (u.equipe_ids ?? (u.equipe_id ? [u.equipe_id] : [])).includes(eq.id) && u.actif).length
                const isFiltered = filterEquipe === eq.id
                return (
                  <div key={eq.id}
                    className={cn('flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer',
                      isFiltered ? 'border-purple bg-purple/5' : 'border-border bg-white hover:border-purple/30')}
                    onClick={() => setFilterEquipe(isFiltered ? null : eq.id)}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: eq.couleur ?? '#4A4CC8' }} />
                    <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                      <InlineEdit value={eq.nom} onSave={v => updateEquipe.mutateAsync({ id: eq.id, updates: { nom: v } })} />
                    </div>
                    <span className="text-xs text-subtle shrink-0">{nb}</span>
                    <button onClick={e => { e.stopPropagation(); deleteEq(eq) }}
                      className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
              {!equipesActives.length && (
                <p className="text-subtle text-xs">Aucune équipe créée.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Colonne droite : Utilisateurs ───────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Formulaire d'invitation */}
          {showInvite && (
            <div className="bg-white rounded-2xl border border-purple/30 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus size={15} className="text-purple" />
                <span className="text-sm font-semibold text-navy">Inviter un utilisateur</span>
                <button onClick={() => setShowInvite(false)} className="ml-auto p-1 rounded-lg hover:bg-bg text-subtle hover:text-navy"><X size={14} /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><div className="ds-label mb-1">Email *</div>
                  <input value={inv.email} onChange={e => setInv(f => ({ ...f, email: e.target.value }))}
                    className="ds-input" placeholder="prenom.nom@exemple.fr" type="email" autoFocus />
                </div>
                <div><div className="ds-label mb-1">Nom affiché</div>
                  <input value={inv.display_name} onChange={e => setInv(f => ({ ...f, display_name: e.target.value }))}
                    className="ds-input" placeholder="Prénom Nom" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><div className="ds-label mb-1">Trigramme</div>
                  <input value={inv.trigramme} onChange={e => setInv(f => ({ ...f, trigramme: e.target.value.toUpperCase() }))}
                    className="ds-input" maxLength={4} placeholder="JDU" />
                </div>
                <div><div className="ds-label mb-1">Prénom</div>
                  <input value={inv.prenom} onChange={e => setInv(f => ({ ...f, prenom: e.target.value }))} className="ds-input" />
                </div>
                <div><div className="ds-label mb-1">Nom</div>
                  <input value={inv.nom} onChange={e => setInv(f => ({ ...f, nom: e.target.value }))} className="ds-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 items-start">
                <div><div className="ds-label mb-1">Rôle métier</div>
                  <input value={inv.role_metier} onChange={e => setInv(f => ({ ...f, role_metier: e.target.value }))}
                    className="ds-input" placeholder="PO, BE Mécanique…" />
                </div>
                <div>
                  <div className="ds-label mb-2">Couleur avatar</div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: inv.couleur }}>
                      {inv.trigramme || (inv.prenom?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {BRAND_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setInv(f => ({ ...f, couleur: c }))}
                          className={cn('w-4 h-4 rounded-full transition-transform hover:scale-110', inv.couleur === c && 'ring-2 ring-navy ring-offset-1')}
                          style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Équipes */}
              {equipesActives.length > 0 && (
                <div className="mb-3">
                  <div className="ds-label mb-1.5">Équipes</div>
                  <div className="flex flex-wrap gap-2">
                    {equipesActives.map(eq => {
                      const sel = invEquipes.includes(eq.id)
                      return (
                        <button key={eq.id} type="button"
                          onClick={() => setInvEquipes(prev => sel ? prev.filter(id => id !== eq.id) : [...prev, eq.id])}
                          className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                            sel ? 'border-transparent text-white' : 'border-border bg-white text-subtle hover:border-purple/40')}
                          style={sel ? { background: eq.couleur ?? '#4A4CC8' } : undefined}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: sel ? 'white' : (eq.couleur ?? '#4A4CC8') }} />
                          {eq.nom}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* Rôle global */}
                <div><div className="ds-label mb-1">Rôle global</div>
                  <div className="flex gap-2">
                    {[{ val: false, label: 'Utilisateur' }, { val: true, label: 'Administrateur' }].map(opt => (
                      <button key={String(opt.val)} type="button" onClick={() => setInv(f => ({ ...f, isAdmin: opt.val }))}
                        className={cn('flex-1 px-2 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                          inv.isAdmin === opt.val ? 'border-purple bg-purple/5 text-purple' : 'border-border text-subtle hover:border-navy/30 hover:text-navy')}>
                        {opt.val && <Shield size={10} className="inline mr-1" />}{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Accès produits */}
              {!inv.isAdmin && produitsActifs.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="ds-label mb-0">Accès produits</div>
                    <div className="flex gap-1.5 ml-auto">
                      {(['po','dev','lecteur'] as RoleProduit[]).map(r => (
                        <button key={r} type="button"
                          onClick={() => setInvRoles(Object.fromEntries(produitsActifs.map(p => [p.id, r])))}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border hover:border-purple/50 hover:text-purple text-subtle transition-colors capitalize">
                          Tout {r}
                        </button>
                      ))}
                      <button type="button"
                        onClick={() => setInvRoles({})}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border hover:border-red/40 hover:text-red text-subtle transition-colors">
                        Aucun
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {produitsActifs.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                        <span className="text-xs text-navy flex-1 truncate">{p.nom}</span>
                        <select value={invRoles[p.id] ?? 'none'}
                          onChange={e => setInvRoles(r => ({ ...r, [p.id]: e.target.value as RoleProduit | 'none' }))}
                          className="ds-select text-xs py-1 w-28">
                          <option value="none">— Aucun —</option>
                          <option value="po">PO</option>
                          <option value="dev">Dev</option>
                          <option value="lecteur">Lecteur</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-border">
                <button onClick={handleInvite} disabled={inviteUser.isPending || !inv.email.trim()}
                  className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-40">
                  <UserPlus size={13} />
                  {inviteUser.isPending ? 'Envoi…' : 'Envoyer l\'invitation'}
                </button>
                <button onClick={() => setShowInvite(false)} className="ds-btn ds-btn-sm">Annuler</button>
              </div>
            </div>
          )}

          {/* Barre de recherche + filtre actif */}
          <div className="flex items-center gap-2">
            <div className="ds-searchbar flex-1">
              <span className="text-subtle text-xs">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par nom, trigramme, rôle…" />
              {search && <button onClick={() => setSearch('')} className="text-subtle hover:text-navy"><X size={12} /></button>}
            </div>
            {filterEquipe !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold shrink-0"
                style={{ borderColor: equipeMap[filterEquipe]?.couleur ?? '#4A4CC8', color: equipeMap[filterEquipe]?.couleur ?? '#4A4CC8', background: (equipeMap[filterEquipe]?.couleur ?? '#4A4CC8') + '15' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: equipeMap[filterEquipe]?.couleur ?? '#4A4CC8' }} />
                {equipeMap[filterEquipe]?.nom}
                <button onClick={() => setFilterEquipe(null)} className="ml-1 hover:opacity-60"><X size={10} /></button>
              </div>
            )}
            <div className="text-xs text-subtle shrink-0">
              {usersFiltered.length} / {utilisateurs.filter(u => u.actif).length}
            </div>
          </div>

          {/* Grille utilisateurs */}
          {usersFiltered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {usersFiltered.map(u => <UserCard key={u.user_id} u={u} />)}
            </div>
          ) : (
            <div className="ds-card flex flex-col items-center justify-center py-16 text-subtle gap-3">
              <Users size={40} className="opacity-20" />
              <p className="text-sm font-medium">
                {filterEquipe !== null ? `Aucun utilisateur dans ${equipeMap[filterEquipe]?.nom}` : 'Aucun utilisateur trouvé'}
              </p>
              <button onClick={openInvite} className="ds-btn-primary ds-btn-sm flex items-center gap-1">
                <UserPlus size={13} /> Inviter le premier utilisateur
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
