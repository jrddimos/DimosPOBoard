import { useState, useMemo } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useTaches } from '@/hooks/useTaches'
import { useDod, useCreateDodItem, useUpdateDodItem, useDeleteDodItem, type DodItem } from '@/hooks/useDod'
import { useDodCategories, useCreateDodCategorie, type DodCategorie } from '@/hooks/useDodCategories'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { confirm } from '@/components/ui/ConfirmModal'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { EPIC_LIST, EPIC_COLORS, JALON_LIST, JALON_COLORS } from '@/constants'
import { epicShortName } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, SlidersHorizontal, ClipboardCheck, BookOpen, BarChart3, Tag } from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { SelectPicker } from '@/components/ui/SelectPicker'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'

type PageTab  = 'referentiel' | 'couverture'
type GroupBy  = 'epic' | 'jalon'
type FilterDod = 'all' | 'avec' | 'sans'

// ── Formulaire d'un critère DoD ───────────────────────────────
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

  return (
    <div className="bg-bg border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="ds-label mb-1 block">Code *</label>
          <input value={code} onChange={e => setCode(e.target.value)} className="ds-input font-mono"
            placeholder="DOD-01" />
        </div>
        <div className="sm:col-span-2">
          <label className="ds-label mb-1 block">Titre *</label>
          <input value={titre} onChange={e => setTitre(e.target.value)} className="ds-input"
            placeholder="Tests unitaires couvrent ≥ 80%" />
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
          <label className="ds-label mb-1 block">Ordre</label>
          <input type="number" value={ordre} onChange={e => setOrdre(+e.target.value)} className="ds-input" min={0} />
        </div>
        <div className="sm:col-span-1">
          <label className="ds-label mb-1 block">Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} className="ds-input" placeholder="Optionnel…" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ code, titre, description: desc || null, categorie: categorie || null, actif: initial?.actif ?? true, ordre })}
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
  const [nom, setNom] = useState('')

  function countFor(nomCat: string) { return items.filter(i => i.categorie === nomCat).length }

  async function add() {
    const v = nom.trim()
    if (!v) return
    if (categories.some(c => c.nom.toLowerCase() === v.toLowerCase())) { toast('Cette catégorie existe déjà', 'error'); return }
    await createCategorie.mutateAsync(v)
    setNom('')
    toast(`Catégorie "${v}" ajoutée`)
  }

  async function rename(cat: DodCategorie) {
    const next = window.prompt('Renommer la catégorie', cat.nom)?.trim()
    if (!next || next === cat.nom) return
    const ok = await confirm({ title: 'Renommer la catégorie ?', message: `"${cat.nom}" → "${next}" sur tous les critères concernés.`, confirmLabel: 'Renommer' })
    if (!ok) return
    await supabase.from('dod_categories').update({ nom: next }).eq('id', cat.id)
    await supabase.from('dod').update({ categorie: next }).eq('categorie', cat.nom).eq('produit_id', produitId)
    qc.invalidateQueries({ queryKey: ['dod_categories', produitId] })
    qc.invalidateQueries({ queryKey: ['dod', produitId] })
    toast('Catégorie renommée')
  }

  async function del(cat: DodCategorie) {
    const n = countFor(cat.nom)
    const ok = await confirm({
      title: 'Supprimer cette catégorie ?',
      message: n > 0 ? `${n} critère${n > 1 ? 's' : ''} concerné${n > 1 ? 's' : ''} n'aur${n > 1 ? 'ont' : 'a'} plus de catégorie.` : 'Aucun critère concerné.',
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
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border">
              <span className="flex-1 text-sm font-medium text-navy truncate">{cat.nom}</span>
              <span className="text-xs text-subtle">{countFor(cat.nom)} critère{countFor(cat.nom) !== 1 ? 's' : ''}</span>
              <button onClick={() => rename(cat)} title="Renommer" className="p-1.5 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={() => del(cat)} title="Supprimer" className="p-1.5 rounded-lg text-subtle hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 size={12} />
              </button>
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
  const create = useCreateDodItem()
  const update = useUpdateDodItem()
  const del    = useDeleteDodItem()
  const toast  = useToast()
  const qc     = useQueryClient()
  const { canEdit }      = useAuth()
  const { produitActif } = useProduit()
  const canEditDod = produitActif ? canEdit(produitActif.id) : false

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
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  async function handleCreate(v: Omit<DodItem, 'id' | 'created_at' | 'produit_id'>) {
    await create.mutateAsync(v)
    toast(`Critère "${v.code}" créé`)
    setShowAdd(false)
  }

  async function handleUpdate(id: number, v: Omit<DodItem, 'id' | 'created_at' | 'produit_id'>) {
    await update.mutateAsync({ id, updates: v })
    toast('Critère mis à jour')
    setEditId(null)
  }

  async function handleToggle(item: DodItem) {
    await update.mutateAsync({ id: item.id, updates: { actif: !item.actif } })
  }

  async function handleDelete(item: DodItem) {
    if (!window.confirm(`Supprimer "${item.code} — ${item.titre}" ?`)) return
    await del.mutateAsync(item.id)
    toast(`"${item.code}" supprimé`)
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-subtle">
          {items.length} critère{items.length !== 1 ? 's' : ''} · {items.filter(i => i.actif).length} actif{items.filter(i => i.actif).length !== 1 ? 's' : ''}
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
              <Plus size={13} /> Ajouter un critère
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
          <div className="text-3xl mb-2">📋</div>
          <p className="font-medium text-sm">Aucun critère DoD défini</p>
          <p className="text-xs">Commencez par ajouter les critères de votre Definition of Done.</p>
        </div>
      ) : (
        byCategorie.map(([categorie, catItems]) => (
          <div key={categorie} className="ds-card">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-subtle uppercase tracking-wider">{categorie}</span>
              <span className="text-xs text-subtle/60">({catItems.length})</span>
            </div>
            <div className="flex flex-col gap-2">
              {catItems.map(item => (
                editId === item.id && canEditDod ? (
                  <DodForm key={item.id}
                    initial={item}
                    categories={categories}
                    onSave={v => handleUpdate(item.id, v)}
                    onCancel={() => setEditId(null)}
                    loading={update.isPending} />
                ) : (
                  <div key={item.id} className={cn(
                    'flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all',
                    item.actif ? 'bg-card border-border' : 'bg-bg border-border/50 opacity-60'
                  )}>
                    <span className="font-mono text-xs font-bold text-indigo-600 shrink-0 mt-0.5 w-16">{item.code}</span>
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm font-medium', !item.actif && 'line-through text-subtle')}>{item.titre}</div>
                      {item.description && <div className="text-xs text-subtle mt-0.5">{item.description}</div>}
                    </div>
                    {canEditDod && (
                    <div className="flex items-center gap-1 shrink-0">
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
              ))}
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
  const [groupBy,     setGroupBy]     = useState<GroupBy>('epic')
  const [filter,      setFilter]      = useState<FilterDod>('all')
  const [search,      setSearch]      = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const parents = useMemo(() => taches.filter(t => !t.parent_id), [taches])

  const filtered = useMemo(() => parents.filter(t => {
    if (search && !t.titre.toLowerCase().includes(search.toLowerCase()) && !t.id_tache.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'avec' && !t.lien_dod) return false
    if (filter === 'sans' && t.lien_dod)  return false
    return true
  }), [parents, search, filter])

  const avecDod = parents.filter(t => t.lien_dod).length
  const pctCov  = parents.length ? Math.round(avecDod / parents.length * 100) : 0

  const groups = useMemo(() => {
    if (groupBy === 'epic')
      return EPIC_LIST.map(e => ({ key: e, tasks: filtered.filter(t => t.epic === e), color: EPIC_COLORS[e] ?? '#6366F1' })).filter(g => g.tasks.length)
    return JALON_LIST.map(j => ({ key: j, tasks: filtered.filter(t => t.jalon === j), color: JALON_COLORS[j] ?? '#6366F1' })).filter(g => g.tasks.length)
  }, [filtered, groupBy])

  return (
    <div className="flex flex-col gap-5">
      {/* KPI */}
      <div className="ds-card">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-green rounded-full" style={{ width: `${pctCov}%` }} />
          </div>
          <span className="text-2xl font-bold text-navy">{pctCov}%</span>
          <span className="text-xs text-subtle whitespace-nowrap">{avecDod}/{parents.length} US couvertes</span>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setShowFilters(v => !v)}
          className={cn('relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shrink-0',
            showFilters ? 'bg-brand text-white border-navy' : 'bg-card text-subtle border-border hover:text-navy')}>
          <SlidersHorizontal size={13} />
          Filtres
          {!showFilters && (search || filter !== 'all') && (
            <span className="absolute -top-1.5 -right-1.5 bg-indigo-500 text-white text-[11px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {(search ? 1 : 0) + (filter !== 'all' ? 1 : 0)}
            </span>
          )}
        </button>
        {showFilters && <>
        <div className="ds-searchbar flex-1 max-w-xs">
          <span className="text-subtle text-xs">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" />
        </div>
        <ToggleGroup value={filter} onChange={setFilter} options={[
          { key: 'all',  label: 'Tous' },
          { key: 'avec', label: 'Avec DoD' },
          { key: 'sans', label: 'Sans DoD' },
        ]} />
        <ToggleGroup value={groupBy} onChange={setGroupBy} options={[
          { key: 'epic',  label: 'Par Epic' },
          { key: 'jalon', label: 'Par Jalon - Incrément majeur' },
        ]} />
        </>}
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
                <thead><tr>{['ID', 'Titre', 'Critères DoD', 'Statut', 'Sprint'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {group.tasks.map(t => (
                    <tr key={t.id_tache}>
                      <td className="font-semibold text-indigo-600">{t.id_tache}</td>
                      <td className="max-w-xs"><div className="truncate">{t.titre}</div></td>
                      <td>
                        {t.lien_dod ? (
                          <div className="flex flex-wrap gap-1">
                            {t.lien_dod.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(code => {
                              const ref = dodItems.find(d => d.code === code)
                              return (
                                <span key={code} title={ref?.titre ?? code}
                                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-mono font-medium">
                                  {code}
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-xs bg-red/10 text-red px-2 py-0.5 rounded-full font-medium">⚠ Manquant</span>
                        )}
                      </td>
                      <td>
                        {t.statut === 'Fait'
                          ? <span className="text-xs text-green font-semibold">✓</span>
                          : <span className="text-xs text-subtle">{t.statut}</span>}
                      </td>
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

  const actifs = dod.filter(d => d.actif).length

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 gap-y-2">
        <PageTitle icon={<ClipboardCheck size={15}/>} label="Definition of Done" />
        <ToggleGroup value={tab} onChange={setTab} options={[
          { key: 'referentiel', label: 'Référentiel', icon: <BookOpen size={12}/> },
          { key: 'couverture',  label: 'Couverture',  icon: <BarChart3 size={12}/> },
        ]} />
        <div className="ml-auto flex gap-1.5">
          <span className="ds-pill-stat pill-done rounded-full">{actifs} critère{actifs !== 1 ? 's' : ''} actif{actifs !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {tab === 'referentiel' && <ReferentielTab />}
      {tab === 'couverture'  && <CouvertureTab />}

      <ToastContainer />
    </Layout>
  )
}
