import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { PageTitle } from '@/components/ui/PageTitle'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import { useUtilisateurs } from '@/hooks/useEquipes'
import {
  useReunionTypes, useReunionsList, useCreateReunion,
  type ReunionType, type ReunionGenerique,
} from '@/hooks/useReunions'
import { cn, getISOWeek } from '@/lib/utils'
import { CalendarClock, Plus, X, ChevronRight, Lock } from 'lucide-react'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function typeBadgeStyle(couleur: string) {
  return { background: couleur + '1A', color: couleur, border: `1px solid ${couleur}33` }
}

// ── Modal "Nouvelle réunion" ──────────────────────────────────────
function NewReunionModal({ types, onClose }: { types: ReunionType[]; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: produits = [] } = useProduits()
  const { data: membres = [] }  = useUtilisateurs()
  const createReunion = useCreateReunion()

  const [typeId, setTypeId]       = useState<number | null>(types[0]?.id ?? null)
  const [titre, setTitre]         = useState('')
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [produitId, setProduitId] = useState<number | null>(null)
  const [privee, setPrivee]       = useState(false)
  const [participants, setParticipants] = useState<string[]>([])

  const selType = types.find(t => t.id === typeId)
  const isPo    = selType?.builtin === 'po'
  const membresActifs = membres.filter(m => m.actif && m.trigramme)

  async function create() {
    if (!selType) return
    if (isPo) {
      // La réunion PO reste pilotée par semaine : on ouvre la page dédiée sur la semaine de la date choisie
      const d = new Date(date + 'T00:00:00')
      const { semaine, annee } = getISOWeek(d)
      navigate(`/reunions/po?semaine=${semaine}&annee=${annee}`)
      return
    }
    const produit = produits.find(p => p.id === produitId)
    const r = await createReunion.mutateAsync({
      type_id: selType.id,
      titre: titre.trim() || `${selType.nom}${produit ? ` — ${produit.nom}` : ''}`,
      date_reunion: date,
      produit_id: produitId,
      privee,
      participants,
    })
    navigate(`/reunions/${r.id}`)
  }

  return (
    <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-modal w-full max-w-md p-6 animate-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-sm font-bold text-navy">Nouvelle réunion</h3>
          <button onClick={onClose} className="text-subtle hover:text-navy p-1"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <span className="ds-label mb-1.5 block">Type</span>
            <div className="flex flex-wrap gap-1.5">
              {types.map(t => (
                <button key={t.id} onClick={() => setTypeId(t.id)}
                  className={cn('text-xs font-semibold px-3 py-1.5 rounded-full transition-all',
                    typeId === t.id ? 'text-white' : '')}
                  style={typeId === t.id ? { background: t.couleur } : typeBadgeStyle(t.couleur)}>
                  {t.nom}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="ds-label mb-1 block">Date</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ds-input text-xs" />
            </div>
            {!isPo && (
              <div>
                <span className="ds-label mb-1 block">Produit <span className="font-normal normal-case">(optionnel)</span></span>
                <select value={produitId ?? ''} onChange={e => setProduitId(e.target.value ? Number(e.target.value) : null)} className="ds-select text-xs">
                  <option value="">— Transverse</option>
                  {produits.filter(p => p.actif).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
            )}
          </div>

          {!isPo && (
            <div>
              <span className="ds-label mb-1 block">Titre <span className="font-normal normal-case">(optionnel)</span></span>
              <input value={titre} onChange={e => setTitre(e.target.value)} className="ds-input text-xs"
                placeholder={selType ? `${selType.nom}…` : 'Titre de la réunion'} />
            </div>
          )}

          {isPo && (
            <p className="text-xs text-subtle bg-bg rounded-lg px-3 py-2.5">
              La réunion PO est hebdomadaire : tu seras redirigé vers la semaine correspondant à la date choisie.
            </p>
          )}

          {!isPo && (
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={privee} onChange={e => setPrivee(e.target.checked)} className="accent-indigo-500" />
                <span className="flex items-center gap-1.5 font-semibold text-navy"><Lock size={12} /> Réunion privée</span>
                <span className="text-subtle">— visible uniquement par toi, les participants et les admins</span>
              </label>
              {privee && (
                <div>
                  <span className="ds-label mb-1.5 block">Participants</span>
                  <div className="flex flex-wrap gap-1.5">
                    {membresActifs.map(m => {
                      const on = participants.includes(m.trigramme!)
                      return (
                        <button key={m.trigramme} type="button"
                          onClick={() => setParticipants(prev => on ? prev.filter(t => t !== m.trigramme) : [...prev, m.trigramme!])}
                          className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border transition-all',
                            on ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-card text-subtle border-border hover:border-indigo-300')}>
                          {m.trigramme}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button onClick={onClose} className="ds-btn">Annuler</button>
            <button onClick={create} disabled={createReunion.isPending || !selType} className="ds-btn-primary">
              {isPo ? 'Ouvrir la semaine' : 'Créer la réunion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page hub ──────────────────────────────────────────────────────
export default function ReunionsHubPage() {
  const navigate = useNavigate()
  const { data: types = [], isLoading: loadTypes } = useReunionTypes()
  const { data: reunions = [], isLoading: loadReu } = useReunionsList()
  const { data: produits = [] } = useProduits()

  const [filterType, setFilterType] = useState<number | null>(null)
  const [showNew, setShowNew]       = useState(false)

  const typeById = useMemo(() => new Map(types.map(t => [t.id, t])), [types])
  const produitById = useMemo(() => new Map(produits.map(p => [p.id, p])), [produits])

  const filtered = useMemo(() =>
    reunions.filter(r => filterType === null || r.type_id === filterType),
    [reunions, filterType])

  const todayIso = new Date().toISOString().slice(0, 10)
  const aVenir  = filtered.filter(r => (r.date_reunion ?? '') >= todayIso)
  const passees = filtered.filter(r => (r.date_reunion ?? '') < todayIso)

  function open(r: ReunionGenerique) {
    const t = r.type_id ? typeById.get(r.type_id) : null
    if (t?.builtin === 'po' || (!t && r.semaine)) {
      navigate(`/reunions/po?semaine=${r.semaine}&annee=${r.annee}`)
    } else {
      navigate(`/reunions/${r.id}`)
    }
  }

  function Row({ r }: { r: ReunionGenerique }) {
    const t = r.type_id ? typeById.get(r.type_id) : null
    const produit = r.produit_id ? produitById.get(r.produit_id) : null
    const label = r.titre || (t?.builtin === 'po' && r.semaine ? `Hebdo — Semaine ${r.semaine} / ${r.annee}` : t?.nom || 'Réunion')
    const isToday = r.date_reunion === todayIso
    return (
      <button onClick={() => open(r)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-bg/60 transition-colors text-left group">
        {t && (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0" style={typeBadgeStyle(t.couleur)}>
            {t.nom}
          </span>
        )}
        <span className="flex-1 min-w-0 text-sm font-medium text-navy truncate flex items-center gap-1.5">
          {r.privee && <Lock size={11} className="text-amber-500 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        {produit && (
          <span className="flex items-center gap-1.5 text-xs text-subtle shrink-0">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: produit.couleur ?? '#4A4CC8' }} />
            {produit.nom}
          </span>
        )}
        {r.animateur && <span className="text-xs text-subtle shrink-0 hidden sm:inline">{r.animateur}</span>}
        <span className={cn('text-xs shrink-0 tabular-nums', isToday ? 'font-bold text-indigo-600' : 'text-subtle')}>
          {isToday ? "Aujourd'hui" : fmtDate(r.date_reunion)}
        </span>
        <ChevronRight size={14} className="text-subtle/40 group-hover:text-navy shrink-0 transition-colors" />
      </button>
    )
  }

  if (loadTypes || loadReu) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5 gap-y-2">
        <PageTitle icon={<CalendarClock size={15} />} label="Réunions" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setFilterType(null)}
            className={cn('ds-pill', filterType === null && 'active')}>Toutes</button>
          {types.map(t => (
            <button key={t.id} onClick={() => setFilterType(filterType === t.id ? null : t.id)}
              className="text-xs font-medium px-2.5 py-1 rounded-full transition-all"
              style={filterType === t.id ? { background: t.couleur, color: '#fff' } : typeBadgeStyle(t.couleur)}>
              {t.nom}
            </button>
          ))}
        </div>
        <button onClick={() => setShowNew(true)} className="ds-btn-primary ml-auto flex items-center gap-1.5 shrink-0">
          <Plus size={13} /> Nouvelle réunion
        </button>
      </div>

      <div className="flex flex-col gap-5 max-w-4xl 3xl:max-w-6xl">
        <div>
          <div className="text-xs font-bold text-navy uppercase tracking-wider mb-2 px-1">
            À venir {aVenir.length > 0 && <span className="text-subtle font-medium">({aVenir.length})</span>}
          </div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {aVenir.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-subtle/40 gap-2">
                <CalendarClock size={28} />
                <p className="text-xs italic">Aucune réunion planifiée</p>
              </div>
            ) : [...aVenir].sort((a, b) => (a.date_reunion ?? '').localeCompare(b.date_reunion ?? '')).map(r => <Row key={r.id} r={r} />)}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-navy uppercase tracking-wider mb-2 px-1">
            Passées {passees.length > 0 && <span className="text-subtle font-medium">({passees.length})</span>}
          </div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {passees.length === 0 ? (
              <div className="py-8 text-center text-xs text-subtle/40 italic">Aucune réunion passée</div>
            ) : passees.map(r => <Row key={r.id} r={r} />)}
          </div>
        </div>
      </div>

      {showNew && <NewReunionModal types={types} onClose={() => setShowNew(false)} />}
    </Layout>
  )
}
