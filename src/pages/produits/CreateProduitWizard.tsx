import { useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { useCreateProduit } from '@/hooks/useProduits'
import type { TrimObjectif } from '@/hooks/useProduits'
import { useUpdateProduit } from '@/hooks/useProduits'
import { useProduit } from '@/contexts/ProduitContext'
import { useFinanceConfig, useUpdateFinanceConfig } from '@/hooks/useFinanceConfig'
import type { TrimConfig } from '@/hooks/useFinanceConfig'
import { useUpsertSprint } from '@/hooks/useSprints'
import { useEpics, useCreateEpic, useDeleteEpic } from '@/hooks/useEpics'
import { useJalons, useCreateJalon, useDeleteJalon } from '@/hooks/useJalons'
import { useDodCategories, useCreateDodCategorie, useDeleteDodCategorie } from '@/hooks/useDodCategories'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useUpsertRoleProduit, useInviteUser } from '@/hooks/useUserManagement'
import type { RoleProduit } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { BRAND_COLORS } from '@/constants'
import { cn } from '@/lib/utils'
import { Plus, Trash2, UserPlus, Mail } from 'lucide-react'

const ROLE_LABEL: Record<RoleProduit, string> = { po: 'PO', dev: 'Dev', lecteur: 'Lecteur' }

function currentQuarter(): { id: string; label: string } {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return { id: `Q${q}-${now.getFullYear()}`, label: `Q${q} ${now.getFullYear()}` }
}

// ── Étape 1 : Produit ────────────────────────────────────────────
function StepProduit({ nom, setNom, description, setDescription, couleur, setCouleur }: {
  nom: string; setNom: (v: string) => void
  description: string; setDescription: (v: string) => void
  couleur: string; setCouleur: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-subtle">Ce nom sera visible partout dans l'app — tu pourras le modifier plus tard.</p>
      <div>
        <label className="ds-label mb-1 block">Nom *</label>
        <input value={nom} onChange={e => setNom(e.target.value)} className="ds-input" placeholder="Ex: Profileuse D4X" autoFocus />
      </div>
      <div>
        <label className="ds-label mb-1 block">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} className="ds-input" placeholder="Description courte…" />
      </div>
      <div>
        <label className="ds-label mb-1.5 block">Couleur</label>
        <div className="flex gap-2 flex-wrap">
          {BRAND_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setCouleur(c)}
              className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-navy ring-offset-2')}
              style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Étape 2 : Premier trimestre (trimestre + sprints) ────────────
async function persistTrimestre(params: {
  produitId: number
  financeConfig: { trimestres: TrimConfig[]; jours_par_trim: number } | undefined
  updateFinanceConfig: ReturnType<typeof useUpdateFinanceConfig>
  upsertSprint: ReturnType<typeof useUpsertSprint>
  updateProduit: ReturnType<typeof useUpdateProduit>
  nbSprints: number
  dureeSemaines: number
}) {
  const { produitId, financeConfig, updateFinanceConfig, upsertSprint, updateProduit, nbSprints, dureeSemaines } = params
  if (nbSprints <= 0) return
  const cur = currentQuarter()
  const trimestres = financeConfig?.trimestres ?? []
  let trim = trimestres.find(t => t.id === cur.id)
  if (!trim) {
    trim = { id: cur.id, label: cur.label, jours_ouvres: financeConfig?.jours_par_trim ?? 65 }
    await updateFinanceConfig.mutateAsync({ trimestres: [...trimestres, trim] })
  }

  const sprintNumbers: string[] = []
  let cursor = new Date()
  for (let i = 0; i < nbSprints; i++) {
    const numero = `S${String(i + 1).padStart(2, '0')}`
    const start = new Date(cursor)
    const end = new Date(start.getTime() + dureeSemaines * 7 * 86400000)
    await upsertSprint.mutateAsync({
      numero, statut: 'planifie', started_at: start.toISOString(), closed_at: end.toISOString(),
      objectifs: null, review: null, est_actif: false,
    })
    sprintNumbers.push(numero)
    cursor = end
  }

  const trimObjectif: TrimObjectif = {
    id: crypto.randomUUID(), trimestre: trim.label, objectifs: [],
    budget_etp: null, budget_invest: null, budget_achats: null,
    previsionnel_verrouille: false, sprints_ids: sprintNumbers,
    realise_etp: null, realise_invest: null, realise_achats: null,
    kpis: '', outcome_desc: '', outcome_euros: null,
    statut: null, lance: true, pause: false, cloture: false,
    jours_ouvres: trim.jours_ouvres,
    budget_invest_details: undefined, realise_invest_details: undefined,
    budget_achats_details: undefined, realise_achats_details: undefined,
    budget_etp_detail: undefined, realise_etp_detail: undefined,
  }
  await updateProduit.mutateAsync({ id: produitId, updates: { objectifs_trimestriels: [trimObjectif] } })
}

// ── Bloc générique "répéteur" (Epics / Jalons / Catégories) ──────
function Repeater<T extends { id: number }>({ items, renderItem, onDelete, deleting, children }: {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  onDelete: (id: number) => void
  deleting: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {children}
      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border">
              <div className="flex-1 min-w-0">{renderItem(item)}</div>
              <button onClick={() => onDelete(item.id)} disabled={deleting}
                className="p-1.5 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Étape 3 : Epics ───────────────────────────────────────────────
function StepEpics() {
  const { data: epics = [] } = useEpics()
  const createEpic = useCreateEpic()
  const deleteEpic  = useDeleteEpic()
  const [nom, setNom] = useState('')

  // Numéro auto-généré et séquentiel (EPIC 1, 2, 3…) — plus de saisie
  // libre ; réordonnable ensuite par glisser-déposer dans Setup > Epics.
  async function add() {
    const n = nom.trim()
    if (!n) return
    const couleur = BRAND_COLORS[epics.length % BRAND_COLORS.length]
    await createEpic.mutateAsync({ nom: n, couleur, bg_couleur: `${couleur}22` })
    setNom('')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-subtle">Les grands sous-ensembles du produit (ex: EPIC 1 — Train de galets). Tu pourras en ajouter d'autres plus tard.</p>
      <Repeater items={epics} onDelete={id => deleteEpic.mutate(id)} deleting={deleteEpic.isPending}
        renderItem={e => <span className="text-sm text-navy"><span className="font-mono font-bold text-brand mr-1.5">{e.code}</span>{e.nom}</span>}>
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="ds-label mb-1 block">Nom</label>
            <input value={nom} onChange={ev => setNom(ev.target.value)} className="ds-input" placeholder="Train de galets" onKeyDown={ev => ev.key === 'Enter' && add()} /></div>
          <button onClick={add} disabled={createEpic.isPending || !nom.trim()} className="ds-btn-primary ds-btn-sm flex items-center gap-1"><Plus size={13} /> Ajouter</button>
        </div>
      </Repeater>
    </div>
  )
}

// ── Étape 4 : Jalons ──────────────────────────────────────────────
function StepJalons() {
  const { data: jalons = [] } = useJalons()
  const createJalon = useCreateJalon()
  const deleteJalon  = useDeleteJalon()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')

  // Numéro + nom + description obligatoires, comme dans Setup > Jalons.
  async function add() {
    const c = code.trim().toUpperCase(), n = nom.trim(), d = description.trim()
    if (!c || !n || !d) return
    if (jalons.some(j => j.code.toLowerCase() === c.toLowerCase())) { toast('Ce jalon existe déjà', 'error'); return }
    const couleur = BRAND_COLORS[jalons.length % BRAND_COLORS.length]
    await createJalon.mutateAsync({ code: c, nom: n, description: d, couleur })
    setCode(''); setNom(''); setDescription('')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-subtle">Les incréments machine attendus (ex: I1 — Proto A, I2 — Proto B…).</p>
      <Repeater items={jalons} onDelete={id => deleteJalon.mutate(id)} deleting={deleteJalon.isPending}
        renderItem={j => <span className="text-sm text-navy"><span className="font-mono font-bold text-brand mr-1.5">{j.code}</span>{j.nom}</span>}>
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <div className="w-24"><label className="ds-label mb-1 block">Numéro</label>
              <input value={code} onChange={ev => setCode(ev.target.value.toUpperCase())} className="ds-input" maxLength={5} placeholder="I1" /></div>
            <div className="flex-1"><label className="ds-label mb-1 block">Nom</label>
              <input value={nom} onChange={ev => setNom(ev.target.value)} className="ds-input" placeholder="Proto A" /></div>
          </div>
          <div><label className="ds-label mb-1 block">Description</label>
            <textarea value={description} onChange={ev => setDescription(ev.target.value)} rows={2}
              className="ds-textarea text-sm w-full" placeholder="Ce que ce Jalon représente…" /></div>
          <button onClick={add} disabled={createJalon.isPending || !code.trim() || !nom.trim() || !description.trim()}
            className="ds-btn-primary ds-btn-sm self-start flex items-center gap-1"><Plus size={13} /> Ajouter</button>
        </div>
      </Repeater>
    </div>
  )
}

// ── Étape 5 : Catégories d'exigences ─────────────────────────────
function StepExigences() {
  const { data: categories = [] } = useDodCategories()
  const createCat = useCreateDodCategorie()
  const deleteCat  = useDeleteDodCategorie()
  const toast = useToast()
  const [nom, setNom] = useState('')

  async function add() {
    const v = nom.trim()
    if (!v) return
    if (categories.some(c => c.nom.toLowerCase() === v.toLowerCase())) { toast('Cette catégorie existe déjà', 'error'); return }
    await createCat.mutateAsync(v)
    setNom('')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-subtle">
        Les catégories d'exigences (par sous-ensemble, ex: "Alimentation - Avaloir"). Les exigences elles-mêmes se
        remplissent ensuite dans la page Exigences.
      </p>
      <Repeater items={categories} onDelete={id => deleteCat.mutate(id)} deleting={deleteCat.isPending}
        renderItem={c => <span className="text-sm text-navy">{c.nom}</span>}>
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="ds-label mb-1 block">Catégorie</label>
            <input value={nom} onChange={ev => setNom(ev.target.value)} className="ds-input" placeholder="Alimentation - Avaloir" onKeyDown={ev => ev.key === 'Enter' && add()} /></div>
          <button onClick={add} disabled={createCat.isPending || !nom.trim()} className="ds-btn-primary ds-btn-sm flex items-center gap-1"><Plus size={13} /> Ajouter</button>
        </div>
      </Repeater>
    </div>
  )
}

// ── Étape 6 : Équipe & rôles ──────────────────────────────────────
function StepEquipe({ produitId }: { produitId: number | null }) {
  const { data: utilisateurs = [] } = useUtilisateurs()
  const upsertRole  = useUpsertRoleProduit()
  const inviteUser  = useInviteUser()
  const toast = useToast()

  const [mode, setMode]   = useState<'existant' | 'nouveau'>('existant')
  const [userId, setUserId] = useState('')
  const [email, setEmail]   = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole]     = useState<RoleProduit>('dev')
  const [added, setAdded]   = useState<{ label: string; role: RoleProduit }[]>([])

  async function add() {
    if (!produitId) return
    if (mode === 'existant') {
      if (!userId) return
      const u = utilisateurs.find(x => x.user_id === userId)
      await upsertRole.mutateAsync({ user_id: userId, produit_id: produitId, role })
      setAdded(a => [...a, { label: u ? ([u.prenom, u.nom].filter(Boolean).join(' ') || u.display_name || u.trigramme || 'Utilisateur') : 'Utilisateur', role }])
      setUserId('')
      toast('Rôle attribué')
    } else {
      const e = email.trim()
      if (!e) return
      await inviteUser.mutateAsync({ email: e, display_name: displayName.trim() || e, produit_roles: { [produitId]: role } })
      setAdded(a => [...a, { label: e, role }])
      setEmail(''); setDisplayName('')
      toast('Invitation envoyée')
    }
  }

  const availableUsers = utilisateurs.filter(u => u.actif)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-subtle">Donne accès au produit à ton équipe. Tu pourras ajuster les rôles plus tard dans Réglages.</p>

      <div className="flex gap-1 bg-bg border border-border rounded-lg p-0.5 w-fit">
        <button onClick={() => setMode('existant')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all', mode === 'existant' ? 'bg-card shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
          <UserPlus size={12} /> Utilisateur existant
        </button>
        <button onClick={() => setMode('nouveau')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all', mode === 'nouveau' ? 'bg-card shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
          <Mail size={12} /> Nouvel email
        </button>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        {mode === 'existant' ? (
          <div className="flex-1 min-w-[160px]">
            <label className="ds-label mb-1 block">Utilisateur</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className="ds-select">
              <option value="">— Choisir —</option>
              {availableUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {[u.prenom, u.nom].filter(Boolean).join(' ') || u.display_name || u.trigramme || u.user_id}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-[160px]">
              <label className="ds-label mb-1 block">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} className="ds-input" placeholder="prenom.nom@entreprise.com" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="ds-label mb-1 block">Nom affiché</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="ds-input" placeholder="Optionnel" />
            </div>
          </>
        )}
        <div className="w-32">
          <label className="ds-label mb-1 block">Rôle</label>
          <select value={role} onChange={e => setRole(e.target.value as RoleProduit)} className="ds-select">
            <option value="po">PO</option>
            <option value="dev">Dev</option>
            <option value="lecteur">Lecteur</option>
          </select>
        </div>
        <button onClick={add} disabled={upsertRole.isPending || inviteUser.isPending || (mode === 'existant' ? !userId : !email.trim())}
          className="ds-btn-primary ds-btn-sm flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>

      {added.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {added.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border">
              <span className="flex-1 text-sm text-navy">{a.label}</span>
              <span className="text-[11px] font-bold text-subtle bg-bg px-2 py-0.5 rounded-full">{ROLE_LABEL[a.role]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Wizard complet ────────────────────────────────────────────────
export function CreateProduitWizard({ onClose, onDone }: {
  onClose: () => void
  onDone: (produit: { id: number; nom: string; couleur: string }) => void
}) {
  const createProduit = useCreateProduit()
  const updateProduit  = useUpdateProduit()
  const { setProduitActif } = useProduit()
  const { data: financeConfig } = useFinanceConfig()
  const updateFinanceConfig = useUpdateFinanceConfig()
  const upsertSprint = useUpsertSprint()
  const toast = useToast()

  const [produit, setProduit] = useState<{ id: number; nom: string; couleur: string } | null>(null)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [couleur, setCouleur] = useState(BRAND_COLORS[0])

  // StepTrimestre gère son propre affichage mais on a besoin de ses valeurs
  // au clic sur "Suivant" : on les remonte via un état miroir simple.
  const [trimValues, setTrimValues] = useState({ nbSprints: 6, duree: 2 })

  const steps: WizardStep[] = [
    {
      key: 'produit', label: 'Produit',
      content: <StepProduit nom={nom} setNom={setNom} description={description} setDescription={setDescription} couleur={couleur} setCouleur={setCouleur} />,
      onNext: async () => {
        if (!nom.trim()) { toast('Nom obligatoire', 'error'); return false }
        const p = await createProduit.mutateAsync({ nom: nom.trim(), description: description || null, couleur, actif: true, is_template: false })
        setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
        setProduit({ id: p.id, nom: p.nom, couleur: p.couleur ?? couleur })
        toast(`Produit "${p.nom}" créé`)
        return true
      },
    },
    {
      key: 'trimestre', label: 'Trimestre',
      content: <StepTrimestreWrapper values={trimValues} onChange={setTrimValues} />,
      onNext: async () => {
        if (!produit) return true
        await persistTrimestre({
          produitId: produit.id, financeConfig, updateFinanceConfig, upsertSprint, updateProduit,
          nbSprints: trimValues.nbSprints, dureeSemaines: trimValues.duree,
        })
        return true
      },
    },
    { key: 'epics',     label: 'Epics',     content: <StepEpics /> },
    { key: 'jalons',    label: 'Jalons',    content: <StepJalons /> },
    { key: 'exigences', label: 'Exigences', content: <StepExigences /> },
    { key: 'equipe',    label: 'Équipe',    content: <StepEquipe produitId={produit?.id ?? null} />, nextLabel: 'Terminer' },
  ]

  return (
    <Wizard title="Créer un produit" steps={steps} onClose={onClose}
      onFinish={() => { if (produit) onDone(produit) }} />
  )
}

// Petit wrapper pour garder StepTrimestre en lecture des valeurs partagées
// avec le parent (nécessaires à la persistance dans onNext) sans dupliquer
// l'UI de saisie.
function StepTrimestreWrapper({ values, onChange }: {
  values: { nbSprints: number; duree: number }
  onChange: (v: { nbSprints: number; duree: number }) => void
}) {
  const { data: financeConfig } = useFinanceConfig()
  const trimestres = financeConfig?.trimestres ?? []
  const cur = currentQuarter()
  const existing = trimestres.find(t => t.id === cur.id)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-subtle">
        Prépare le trimestre en cours ({cur.label}) et ses premiers sprints. Tu peux passer cette étape et le
        configurer plus tard dans Configuration produit.
      </p>
      <div className="ds-card">
        <div className="text-[11px] font-bold text-navy/75 uppercase tracking-wide mb-2">Trimestre</div>
        <p className="text-sm text-navy">{cur.label}{existing ? ` — ${existing.jours_ouvres} j ouvrés` : ' (nouveau, sera créé)'}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="ds-label mb-1 block">Nombre de sprints</label>
          <input type="number" min={0} max={16} value={values.nbSprints}
            onChange={e => onChange({ ...values, nbSprints: Math.max(0, Number(e.target.value)) })} className="ds-input" />
        </div>
        <div>
          <label className="ds-label mb-1 block">Durée par sprint (semaines)</label>
          <input type="number" min={1} max={8} value={values.duree}
            onChange={e => onChange({ ...values, duree: Math.max(1, Number(e.target.value)) })} className="ds-input" />
        </div>
      </div>
      {values.nbSprints > 0 && (
        <p className="text-[11px] text-subtle">
          Génère S01 à S{String(values.nbSprints).padStart(2, '0')}, {values.duree} semaine{values.duree > 1 ? 's' : ''} chacun, à partir d'aujourd'hui.
        </p>
      )}
    </div>
  )
}
