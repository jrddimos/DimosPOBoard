import { useState, useMemo } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge } from '@/components/ui/Badge'
import { useTaches } from '@/hooks/useTaches'
import { useDod, useCreateDodItem, useUpdateDodItem, useDeleteDodItem, type DodItem, type ExigenceType, type ExigenceCriticite } from '@/hooks/useDod'
import { useDodCategories, useCreateDodCategorie, type DodCategorie } from '@/hooks/useDodCategories'
import { useToast } from '@/hooks/useToast'
import { useVerificationLoops } from '@/hooks/useActivityLog'
import { ToastContainer } from '@/components/ui/Toast'
import { confirm } from '@/components/ui/ConfirmModal'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useEpics, epicFullName } from '@/hooks/useEpics'
import { useJalons } from '@/hooks/useJalons'
import { epicShortName, naturalCompare } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, ListChecks, BookOpen, BarChart3, Tag, Search, AlertTriangle, ShieldCheck, Shield, RotateCcw } from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { SelectPicker } from '@/components/ui/SelectPicker'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'

type PageTab  = 'referentiel' | 'couverture'
type GroupBy  = 'epic' | 'jalon'
type FilterDod = 'all' | 'avec' | 'sans'

export const EXIGENCE_TYPE_CFG: Record<ExigenceType, { label: string; className: string }> = {
  fonctionnelle: { label: 'Fonctionnelle', className: 'bg-brand/10 text-brand' },
  performance:   { label: 'Performance',   className: 'bg-blue/10 text-blue' },
  securite:      { label: 'Sécurité',      className: 'bg-red/10 text-red' },
  cout:          { label: 'Coût',          className: 'bg-orange/10 text-orange' },
}
const CRITICITE_CFG: Record<ExigenceCriticite, { label: string; dot: string }> = {
  haute:   { label: 'Criticité haute',   dot: 'bg-red' },
  moyenne: { label: 'Criticité moyenne', dot: 'bg-orange' },
  basse:   { label: 'Criticité basse',   dot: 'bg-border' },
}

// ── Formulaire d'une exigence ─────────────────────────────────
function DodForm({ initial, categories, onSave, onCancel, loading }: {
  initial?: Partial<DodItem>
  categories: DodCategorie[]
  onSave:   (v: Omit<DodItem, 'id' | 'created_at' | 'produit_id'>) => void
  onCancel: () => void
  loading:  boolean
}) {
  const [code,      setCode]      = useState(initial?.code ?? '')
  const [titre,     setTitre]     = useState(initial?.titre ?? '')
  const [desc,      setDesc]      = useState(initial?.description ?? '')
  const [categorie, setCategorie] = useState(initial?.categorie ?? '')
  const [ordre,     setOrdre]     = useState(initial?.ordre ?? 0)
  const [type,      setType]      = useState<ExigenceType>(initial?.type ?? 'fonctionnelle')
  const [criticite, setCriticite] = useState<ExigenceCriticite>(initial?.criticite ?? 'moyenne')
  const [cible,     setCible]     = useState(initial?.valeur_cible ?? '')
  const [constatee, setConstatee] = useState(initial?.valeur_constatee ?? '')

  const showValeurs = type === 'cout' || type === 'performance'

  return (
    <div className="bg-bg border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="ds-label mb-1 block">Code *</label>
          <input value={code} onChange={e => setCode(e.target.value)} className="ds-input font-mono"
            placeholder="F2.1" />
        </div>
        <div className="sm:col-span-2">
          <label className="ds-label mb-1 block">Titre *</label>
          <input value={titre} onChange={e => setTitre(e.target.value)} className="ds-input"
            placeholder="Profiler une tôle de 0,5 à 0,75 mm sans marquage" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="ds-label mb-1 block">Catégorie</label>
          <SelectPicker
            value={categorie}
            onChange={setCategorie}
            placeholder="— Sans catégorie —"
            searchable
            options={categories.map(c => ({ value: c.nom, label: c.nom }))}
          />
        </div>
        <div>
          <label className="ds-label mb-1 block">Type</label>
          <SelectPicker value={type} onChange={v => setType((v || 'fonctionnelle') as ExigenceType)}
            options={(Object.keys(EXIGENCE_TYPE_CFG) as ExigenceType[]).map(t => ({ value: t, label: EXIGENCE_TYPE_CFG[t].label }))} />
        </div>
        <div>
          <label className="ds-label mb-1 block">Criticité</label>
          <SelectPicker value={criticite} onChange={v => setCriticite((v || 'moyenne') as ExigenceCriticite)}
            options={[
              { value: 'haute',   label: 'Haute' },
              { value: 'moyenne', label: 'Moyenne' },
              { value: 'basse',   label: 'Basse' },
            ]} />
        </div>
      </div>
      {showValeurs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="ds-label mb-1 block">Valeur cible</label>
            <input value={cible} onChange={e => setCible(e.target.value)} className="ds-input"
              placeholder={type === 'cout' ? '≤ 1 200 €' : '≥ 12 m/min'} />
          </div>
          <div>
            <label className="ds-label mb-1 block">Valeur constatée <span className="font-normal text-subtle/60">(dernier essai)</span></label>
            <input value={constatee} onChange={e => setConstatee(e.target.value)} className="ds-input"
              placeholder="—" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="ds-label mb-1 block">Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} className="ds-input" placeholder="Optionnel…" />
        </div>
        <div>
          <label className="ds-label mb-1 block">Ordre</label>
          <input type="number" value={ordre} onChange={e => setOrdre(+e.target.value)} className="ds-input w-24" min={0} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({
            code, titre, description: desc || null, categorie: categorie || null,
            actif: initial?.actif ?? true, ordre, type, criticite,
            verifiee: initial?.verifiee ?? false,
            valeur_cible: cible || null, valeur_constatee: constatee || null,
          })}
          disabled={loading || !code.trim() || !titre.trim()}
          className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
          <Check size={13} /> {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={onCancel} className="ds-btn ds-btn-sm flex items-center gap-1.5">
          <X size={13} /> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Gestion des catégories DoD (par produit) ───────────────────
function CategoriesManager({ categories, items, produitId, qc, toast }: {
  categories: DodCategorie[]; items: DodItem[]; produitId: number
  qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>
}) {
  const createCategorie = useCreateDodCategorie()
  const [nom,       setNom]       = useState('')
  const [editId,    setEditId]    = useState<number | null>(null)
  const [editNom,   setEditNom]   = useState('')
  const [importing, setImporting] = useState(false)

  function countFor(nomCat: string) { return items.filter(i => i.categorie === nomCat).length }

  // Tri par code du 1er critère de chaque catégorie (items déjà triés
  // naturellement depuis useDod), pour suivre l'ordre F1, F2, F9, F10…
  const sortedCategories = [...categories].sort((a, b) => {
    const codeA = items.find(i => i.categorie === a.nom)?.code ?? ''
    const codeB = items.find(i => i.categorie === b.nom)?.code ?? ''
    return naturalCompare(codeA, codeB)
  })

  // Catégories déjà utilisées sur des critères mais absentes de la table
  // dod_categories (ex: valeurs saisies directement, sans passer par ce gestionnaire).
  const missingCats = [...new Set(items.map(i => i.categorie).filter((c): c is string => !!c))]
    .filter(c => !categories.some(cat => cat.nom.toLowerCase() === c.toLowerCase()))

  async function importMissing() {
    setImporting(true)
    try {
      for (const c of missingCats) await createCategorie.mutateAsync(c)
      toast(`${missingCats.length} catégorie${missingCats.length > 1 ? 's' : ''} importée${missingCats.length > 1 ? 's' : ''}`)
    } finally {
      setImporting(false)
    }
  }

  async function add() {
    const v = nom.trim()
    if (!v) return
    if (categories.some(c => c.nom.toLowerCase() === v.toLowerCase())) { toast('Cette catégorie existe déjà', 'error'); return }
    await createCategorie.mutateAsync(v)
    setNom('')
    toast(`Catégorie "${v}" ajoutée`)
  }

  async function rename(cat: DodCategorie) {
    const next = editNom.trim()
    if (!next || next === cat.nom) { setEditId(null); return }
    if (categories.some(c => c.id !== cat.id && c.nom.toLowerCase() === next.toLowerCase())) { toast('Cette catégorie existe déjà', 'error'); return }
    const ok = await confirm({ title: 'Renommer la catégorie ?', message: `"${cat.nom}" → "${next}" sur toutes les exigences concernées.`, confirmLabel: 'Renommer' })
    if (!ok) return
    await supabase.from('dod_categories').update({ nom: next }).eq('id', cat.id)
    await supabase.from('dod').update({ categorie: next }).eq('categorie', cat.nom).eq('produit_id', produitId)
    qc.invalidateQueries({ queryKey: ['dod_categories', produitId] })
    qc.invalidateQueries({ queryKey: ['dod', produitId] })
    setEditId(null)
    toast('Catégorie renommée')
  }

  async function del(cat: DodCategorie) {
    const n = countFor(cat.nom)
    const ok = await confirm({
      title: 'Supprimer cette catégorie ?',
      message: n > 0 ? `${n} exigence${n > 1 ? 's' : ''} concernée${n > 1 ? 's' : ''} n'aur${n > 1 ? 'ont' : 'a'} plus de catégorie.` : 'Aucune exigence concernée.',
      confirmLabel: 'Supprimer', variant: 'danger',
    })
    if (!ok) return
    await supabase.from('dod_categories').delete().eq('id', cat.id)
    await supabase.from('dod').update({ categorie: null }).eq('categorie', cat.nom).eq('produit_id', produitId)
    qc.invalidateQueries({ queryKey: ['dod_categories', produitId] })
    qc.invalidateQueries({ queryKey: ['dod', produitId] })
    toast('Catégorie supprimée')
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-4 flex flex-col gap-3">
      {missingCats.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange/10 border border-orange/20 text-orange text-xs font-medium">
          <span className="flex-1">
            {missingCats.length} catégorie{missingCats.length > 1 ? 's' : ''} utilisée{missingCats.length > 1 ? 's' : ''} sur des exigences mais absente{missingCats.length > 1 ? 's' : ''} de cette liste : {missingCats.join(', ')}
          </span>
          <button onClick={importMissing} disabled={importing}
            className="ds-btn ds-btn-sm shrink-0 disabled:opacity-40">
            {importing ? 'Import…' : 'Importer'}
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="ds-label mb-1 block">Nouvelle catégorie</label>
          <input value={nom} onChange={e => setNom(e.target.value)} className="ds-input"
            placeholder="Ex: Sécurité & Conformité"
            onKeyDown={e => { if (e.key === 'Enter') add() }} />
        </div>
        <button onClick={add} disabled={createCategorie.isPending || !nom.trim()}
          className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Ajouter
        </button>
      </div>
      {categories.length === 0 ? (
        <p className="text-xs text-subtle italic">Aucune catégorie définie pour ce produit.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sortedCategories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border">
              {editId === cat.id ? (
                <>
                  <input value={editNom} onChange={e => setEditNom(e.target.value)} autoFocus
                    className="ds-input py-0.5 text-sm font-medium flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') rename(cat); if (e.key === 'Escape') setEditId(null) }} />
                  <button onClick={() => rename(cat)} title="Valider" className="p-1.5 rounded-lg text-green hover:bg-green/10 transition-colors">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditId(null)} title="Annuler" className="p-1.5 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors">
                    <X size={13} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-navy truncate">{cat.nom}</span>
                  <span className="text-xs text-subtle">{countFor(cat.nom)} exigence{countFor(cat.nom) !== 1 ? 's' : ''}</span>
                  <button onClick={() => { setEditId(cat.id); setEditNom(cat.nom) }} title="Renommer" className="p-1.5 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => del(cat)} title="Supprimer" className="p-1.5 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Onglet Référentiel ────────────────────────────────────────
function ReferentielTab() {
  const { data: items = [], isLoading } = useDod()
  const { data: categories = [] } = useDodCategories()
  const { data: taches = [] } = useTaches()
  const create = useCreateDodItem()
  const update = useUpdateDodItem()
  const del    = useDeleteDodItem()
  const toast  = useToast()
  const qc     = useQueryClient()
  const { canEdit }      = useAuth()
  const { produitActif } = useProduit()
  const canEditDod = produitActif ? canEdit(produitActif.id) : false
  const { data: loops = new Map<string, number>() } = useVerificationLoops(produitActif?.id ?? null)

  const [showAdd, setShowAdd]   = useState(false)
  const [editId, setEditId]     = useState<number | null>(null)
  const [showCategories, setShowCategories] = useState(false)

  const byCategorie = useMemo(() => {
    const map: Record<string, DodItem[]> = {}
    items.forEach(item => {
      const cat = item.categorie ?? 'Sans catégorie'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    })
    // Tri par code du 1er critère de chaque catégorie (les items arrivent déjà
    // triés naturellement depuis useDod) plutôt que par nom de catégorie —
    // pour suivre l'ordre F1, F2, F9, F10… au lieu de l'ordre alphabétique.
    return Object.entries(map).sort(([, a], [, b]) => naturalCompare(a[0].code, b[0].code))
  }, [items])

  // "À statuer" : toutes les US parentes liées sont à Fait, mais l'exigence
  // n'a pas encore été vérifiée (essai conforme ?) — décision humaine à prendre.
  const aStatuer = useMemo(() => {
    const parents = taches.filter(t => !t.parent_id)
    const codesOf = (lien: string | null) => (lien ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
    const set = new Set<number>()
    items.forEach(item => {
      if (!item.actif || item.verifiee) return
      const linked = parents.filter(t => codesOf(t.lien_dod).includes(item.code))
      if (linked.length > 0 && linked.every(t => t.statut === 'Fait')) set.add(item.id)
    })
    return set
  }, [items, taches])

  async function handleCreate(v: Omit<DodItem, 'id' | 'created_at' | 'produit_id'>) {
    await create.mutateAsync(v)
    toast(`Exigence "${v.code}" créée`)
    setShowAdd(false)
  }

  async function handleUpdate(id: number, v: Omit<DodItem, 'id' | 'created_at' | 'produit_id'>) {
    await update.mutateAsync({ id, updates: v })
    toast('Exigence mise à jour')
    setEditId(null)
  }

  async function handleToggle(item: DodItem) {
    await update.mutateAsync({ id: item.id, updates: { actif: !item.actif } })
  }

  async function handleVerify(item: DodItem) {
    // Dé-vérifier (relance d'une boucle) : direct, pas de cérémonie.
    if (item.verifiee) {
      await update.mutateAsync({ id: item.id, updates: { verifiee: false }, item })
      toast(`"${item.code}" repassée à vérifier`)
      return
    }
    // Vérifier : on rappelle les US liées et leur état avant de statuer.
    const linked = taches.filter(t => !t.parent_id &&
      (t.lien_dod ?? '').split(/[,;]/).map(s => s.trim()).includes(item.code))
    const lignes = linked.length
      ? linked.map(t => `${t.statut === 'Fait' ? '✓' : '○'} ${t.id_tache} — ${t.titre}${t.statut !== 'Fait' ? ` (${t.statut})` : ''}`).join('\n')
      : 'Aucune US liée à cette exigence.'
    const ok = await confirm({
      title: `Vérifier ${item.code} ?`,
      message: `${item.titre}\n\nUS liées :\n${lignes}\n\nEssai conforme ? Marquer l'exigence comme vérifiée ?`,
      confirmLabel: 'Marquer vérifiée',
    })
    if (!ok) return
    await update.mutateAsync({ id: item.id, updates: { verifiee: true }, item })
    toast(`"${item.code}" marquée vérifiée ✓`)
  }

  async function handleDelete(item: DodItem) {
    const ok = await confirm({
      title: 'Supprimer cette exigence ?',
      message: `"${item.code} — ${item.titre}" sera définitivement supprimée.`,
      confirmLabel: 'Supprimer', variant: 'danger',
    })
    if (!ok) return
    await del.mutateAsync(item.id)
    toast(`"${item.code}" supprimée`)
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-subtle">
          {items.length} exigence{items.length !== 1 ? 's' : ''} · {items.filter(i => i.actif).length} active{items.filter(i => i.actif).length !== 1 ? 's' : ''} · {items.filter(i => i.verifiee).length} vérifiée{items.filter(i => i.verifiee).length !== 1 ? 's' : ''}
          {aStatuer.size > 0 && <span className="text-orange font-semibold"> · {aStatuer.size} à statuer</span>}
        </div>
        <div className="flex items-center gap-2">
          {canEditDod && (
            <button onClick={() => setShowCategories(v => !v)}
              className={cn('ds-btn-sm flex items-center gap-1.5', showCategories ? 'ds-btn-primary' : 'ds-btn')}>
              <Tag size={13} /> Catégories
            </button>
          )}
          {!showAdd && canEditDod && (
            <button onClick={() => setShowAdd(true)} className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Ajouter une exigence
            </button>
          )}
        </div>
      </div>

      {showCategories && canEditDod && produitActif && (
        <CategoriesManager categories={categories} items={items} produitId={produitActif.id} qc={qc} toast={toast} />
      )}

      {showAdd && canEditDod && (
        <DodForm categories={categories} onSave={handleCreate} onCancel={() => setShowAdd(false)} loading={create.isPending} />
      )}

      {items.length === 0 && !showAdd ? (
        <div className="ds-card flex flex-col items-center py-14 text-subtle gap-2">
          <ListChecks size={40} className="opacity-20 mb-2" />
          <p className="font-medium text-sm">Aucune exigence définie</p>
          <p className="text-xs">Commencez par décrire ce que le produit doit faire, sous-ensemble par sous-ensemble.</p>
        </div>
      ) : (
        byCategorie.map(([categorie, catItems]) => (
          <div key={categorie} className="ds-card">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide">{categorie}</span>
              <span className="text-xs text-subtle/60">({catItems.length})</span>
            </div>
            <div className="flex flex-col gap-2">
              {catItems.map(item => {
                const loopCount = loops.get(item.code) ?? 0
                return editId === item.id && canEditDod ? (
                  <DodForm key={item.id}
                    initial={item}
                    categories={categories}
                    onSave={v => handleUpdate(item.id, v)}
                    onCancel={() => setEditId(null)}
                    loading={update.isPending} />
                ) : (
                  <div key={item.id} className={cn(
                    'flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all',
                    item.actif ? 'bg-card border-border' : 'bg-bg border-border/50 opacity-60',
                    item.verifiee && item.actif && 'border-green/40'
                  )}>
                    <span className="font-mono text-xs font-bold text-brand shrink-0 mt-0.5 w-16">{item.code}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span title={CRITICITE_CFG[item.criticite]?.label}
                          className={cn('w-2 h-2 rounded-full shrink-0 cursor-help', CRITICITE_CFG[item.criticite]?.dot ?? 'bg-border')} />
                        <span className={cn('text-sm font-medium', !item.actif && 'line-through text-subtle')}>{item.titre}</span>
                        {item.type !== 'fonctionnelle' && (
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0',
                            EXIGENCE_TYPE_CFG[item.type]?.className)}>
                            {EXIGENCE_TYPE_CFG[item.type]?.label}
                          </span>
                        )}
                        {item.verifiee && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-green/10 text-green shrink-0">
                            <ShieldCheck size={10} /> Vérifiée
                          </span>
                        )}
                        {loopCount >= 2 && (
                          <span title={`Revalidée ${loopCount} fois — ${loopCount - 1} reprise${loopCount > 2 ? 's' : ''} après un essai non conforme`}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-orange/10 text-orange shrink-0 cursor-help">
                            <RotateCcw size={10} /> {loopCount}ᵉ vérification
                          </span>
                        )}
                        {aStatuer.has(item.id) && (
                          <button onClick={() => canEditDod && handleVerify(item)}
                            title="Toutes les US liées sont terminées — cliquer pour statuer (rappel des US avant confirmation)."
                            className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-orange/10 text-orange shrink-0 transition-colors',
                              canEditDod ? 'hover:bg-orange/20 cursor-pointer' : 'cursor-default')}>
                            <Shield size={10} /> À statuer
                          </button>
                        )}
                      </div>
                      {item.description && <div className="text-xs text-subtle mt-0.5">{item.description}</div>}
                      {(item.valeur_cible || item.valeur_constatee) && (
                        <div className="text-xs mt-0.5">
                          <span className="text-subtle">Cible : </span>
                          <span className="font-semibold text-navy">{item.valeur_cible ?? '—'}</span>
                          <span className="text-subtle"> · Constaté : </span>
                          <span className={cn('font-semibold', item.verifiee ? 'text-green' : 'text-navy')}>{item.valeur_constatee ?? '—'}</span>
                        </div>
                      )}
                    </div>
                    {canEditDod && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleVerify(item)}
                        title={item.verifiee ? 'Repasser à vérifier' : 'Marquer vérifiée (validée par essai)'}
                        className={cn('p-1.5 rounded-lg transition-colors', item.verifiee ? 'text-green hover:bg-green/10' : 'text-subtle hover:text-green hover:bg-green/10')}>
                        {item.verifiee ? <ShieldCheck size={14} /> : <Shield size={14} />}
                      </button>
                      <button onClick={() => handleToggle(item)} title={item.actif ? 'Désactiver' : 'Activer'}
                        className="p-1.5 rounded-lg text-subtle hover:text-navy transition-colors">
                        {item.actif ? <ToggleRight size={16} className="text-green" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => { setEditId(item.id); setShowAdd(false) }}
                        className="p-1.5 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(item)}
                        className="p-1.5 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Onglet Couverture ─────────────────────────────────────────
function CouvertureTab() {
  const { data: taches   = [] } = useTaches()
  const { data: dodItems = [] } = useDod()
  const { data: epicsList = [] } = useEpics()
  const { data: jalonsList = [] } = useJalons()
  const [groupBy, setGroupBy] = useState<GroupBy>('epic')
  const [filter,  setFilter]  = useState<FilterDod>('all')
  const [search,  setSearch]  = useState('')

  const parents = useMemo(() => taches.filter(t => !t.parent_id), [taches])

  const filtered = useMemo(() => parents.filter(t => {
    if (search && !t.titre.toLowerCase().includes(search.toLowerCase()) && !t.id_tache.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'avec' && !t.lien_dod) return false
    if (filter === 'sans' && t.lien_dod)  return false
    return true
  }), [parents, search, filter])

  const avecDod = parents.filter(t => t.lien_dod).length
  const pctCov  = parents.length ? Math.round(avecDod / parents.length * 100) : 0

  // Exigences vérifiées (validées par essai) vs actives — l'indicateur qui
  // pilote la sortie des boucles proto/essais.
  const actives   = dodItems.filter(d => d.actif)
  const verifiees = actives.filter(d => d.verifiee).length
  const pctVerif  = actives.length ? Math.round(verifiees / actives.length * 100) : 0

  const groups = useMemo(() => {
    if (groupBy === 'epic')
      return epicsList.map(e => ({ key: epicFullName(e), tasks: filtered.filter(t => t.epic === epicFullName(e)), color: e.couleur ?? '#6366F1' })).filter(g => g.tasks.length)
    return jalonsList.map(j => ({ key: j.code, tasks: filtered.filter(t => t.jalon === j.code), color: j.couleur ?? '#6366F1' })).filter(g => g.tasks.length)
  }, [filtered, groupBy, epicsList, jalonsList])

  return (
    <div className="flex flex-col gap-5">
      {/* KPI : couverture (US ↔ exigences) + vérification (exigences validées par essai) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="ds-card">
          <div className="text-[11px] font-bold text-navy/75 uppercase tracking-wide mb-2">US couvertes par des exigences</div>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full" style={{ width: `${pctCov}%` }} />
            </div>
            <span className="text-2xl font-bold text-navy">{pctCov}%</span>
            <span className="text-xs text-subtle whitespace-nowrap">{avecDod}/{parents.length} US</span>
          </div>
        </div>
        <div className="ds-card">
          <div className="text-[11px] font-bold text-navy/75 uppercase tracking-wide mb-2">Exigences vérifiées (validées par essai)</div>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-green rounded-full" style={{ width: `${pctVerif}%` }} />
            </div>
            <span className="text-2xl font-bold text-navy">{pctVerif}%</span>
            <span className="text-xs text-subtle whitespace-nowrap">{verifiees}/{actives.length} exig.</span>
          </div>
        </div>
      </div>

      {/* Recherche + filtres + groupement (toujours visibles) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="ds-searchbar flex-1 max-w-xs">
          <Search size={13} className="text-subtle shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" />
        </div>
        <ToggleGroup value={filter} onChange={setFilter} options={[
          { key: 'all',  label: 'Toutes' },
          { key: 'avec', label: 'Couvertes' },
          { key: 'sans', label: 'Non couvertes' },
        ]} />
        <ToggleGroup value={groupBy} onChange={setGroupBy} options={[
          { key: 'epic',  label: 'Par Epic' },
          { key: 'jalon', label: 'Par Jalon' },
        ]} />
      </div>

      {/* Tableau par groupe */}
      <div className="flex flex-col gap-4">
        {groups.map(group => {
          const withDod = group.tasks.filter(t => t.lien_dod).length
          const pct = group.tasks.length ? Math.round(withDod / group.tasks.length * 100) : 0
          return (
            <div key={group.key} className="ds-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-sm" style={{ background: group.color }} />
                <h3 className="font-semibold text-navy text-sm">
                  {groupBy === 'epic' ? epicShortName(group.key) : group.key}
                </h3>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-24">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: group.color }} />
                </div>
                <span className="text-xs font-semibold text-navy">{pct}%</span>
                <span className="text-xs text-subtle">{withDod}/{group.tasks.length}</span>
              </div>
              <table className="ds-table">
                <thead><tr>{['ID', 'Titre', 'Exigences', 'Statut', 'Sprint'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {group.tasks.map(t => (
                    <tr key={t.id_tache}>
                      <td className="font-semibold text-brand">{t.id_tache}</td>
                      <td className="max-w-xs"><div className="truncate">{t.titre}</div></td>
                      <td>
                        {t.lien_dod ? (
                          <div className="flex flex-wrap gap-1">
                            {t.lien_dod.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(code => {
                              const ref = dodItems.find(d => d.code === code)
                              return (
                                <span key={code} title={ref ? `${ref.titre}${ref.verifiee ? ' — vérifiée' : ''}` : code}
                                  className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-mono font-medium',
                                    ref?.verifiee ? 'bg-green/10 text-green' : 'bg-brand/10 text-brand')}>
                                  {ref?.verifiee && <ShieldCheck size={10} />}{code}
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-red/10 text-red px-2 py-0.5 rounded-full font-medium">
                            <AlertTriangle size={11} /> Manquant
                          </span>
                        )}
                      </td>
                      <td><StatutBadge value={t.statut} /></td>
                      <td className="text-subtle">{t.sprint || t.sprint_debut || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
        {!groups.length && (
          <div className="ds-card flex items-center justify-center py-12 text-subtle text-sm">
            Aucune US trouvée.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function DodPage() {
  const [tab, setTab] = useState<PageTab>('referentiel')
  const { data: dod = [] } = useDod()

  const actifs    = dod.filter(d => d.actif).length
  const verifiees = dod.filter(d => d.actif && d.verifiee).length

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 gap-y-2">
        <PageTitle icon={<ListChecks size={15}/>} label="Exigences" />
        <ToggleGroup value={tab} onChange={setTab} options={[
          { key: 'referentiel', label: 'Référentiel', icon: <BookOpen size={12}/> },
          { key: 'couverture',  label: 'Couverture',  icon: <BarChart3 size={12}/> },
        ]} />
        <div className="ml-auto flex gap-1.5">
          <span className="ds-pill-stat pill-done rounded-full">{verifiees}/{actifs} vérifiée{verifiees !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {tab === 'referentiel' && <ReferentielTab />}
      {tab === 'couverture'  && <CouvertureTab />}

      <ToastContainer />
    </Layout>
  )
}
