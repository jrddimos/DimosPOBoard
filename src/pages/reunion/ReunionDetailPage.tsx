import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { MentionField } from '@/components/ui/MentionField'
import { confirm } from '@/components/ui/ConfirmModal'
import { useProduits } from '@/hooks/useProduits'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/contexts/AuthContext'
import {
  useReunionById, useReunionTypes, useUpdateReunionGenerique, useDeleteReunion,
  type SectionKey, type SectionsData, type ActionItem, type DecisionItem, type RisqueItem, type ObjectifItem,
} from '@/hooks/useReunions'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Printer, Trash2, Plus, X, Check,
  Target, AlertTriangle, ListChecks, Gavel, StickyNote, Lock, Unlock, UserPlus, Flag,
} from 'lucide-react'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// Registre des sections : chaque type de réunion assemble ces briques
const SECTION_DEFS: Record<Exclude<SectionKey, 'revue_produits'>, { label: string; icon: React.ReactNode; placeholder?: string }> = {
  objectifs: { label: 'Objectifs de la réunion', icon: <Flag size={14} /> },
  notes:     { label: 'Notes',                icon: <StickyNote size={14} />,    placeholder: 'Points abordés, contexte, décisions informelles… @trg pour mentionner' },
  jalons:    { label: 'Jalons & avancement',  icon: <Target size={14} />,        placeholder: 'Avancement par jalon, dates clés, prochaines étapes…' },
  risques:   { label: 'Risques & blocages',   icon: <AlertTriangle size={14} /> },
  actions:   { label: 'Actions',              icon: <ListChecks size={14} /> },
  decisions: { label: 'Décisions',            icon: <Gavel size={14} /> },
}

const NIVEAU_STYLE: Record<RisqueItem['niveau'], string> = {
  vert:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  orange: 'bg-amber-50 text-amber-700 border-amber-200',
  rouge:  'bg-rose-50 text-rose-700 border-rose-200',
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h2 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
        <span className="text-indigo-500">{icon}</span> {title}
      </h2>
      {children}
    </div>
  )
}

export default function ReunionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const reunionId = Number(id) || null

  const { data: reunion, isLoading } = useReunionById(reunionId)
  const { data: types = [] }    = useReunionTypes()
  const { data: produits = [] } = useProduits()
  const { data: membres = [] }  = useUtilisateurs()
  const update = useUpdateReunionGenerique()
  const remove = useDeleteReunion()

  const type = useMemo(() => types.find(t => t.id === reunion?.type_id) ?? null, [types, reunion])
  const produit = useMemo(() => produits.find(p => p.id === reunion?.produit_id) ?? null, [produits, reunion])
  const membresActifs = membres.filter(m => m.actif)

  // État local éditable, initialisé depuis la DB
  const [titre, setTitre]         = useState('')
  const [animateur, setAnimateur] = useState('')
  const [data, setData]           = useState<SectionsData>({})
  const [privee, setPrivee]       = useState(false)
  const [participants, setParticipants] = useState<string[]>([])
  const [addingPart, setAddingPart] = useState(false)
  const [terminee, setTerminee]   = useState(false)
  // Déverrouillage admin d'une réunion terminée — un simple état d'affichage
  // (pas persisté) : ne modifie jamais `terminee` en base, juste la
  // possibilité d'éditer pendant cette visite de page.
  const [adminUnlocked, setAdminUnlocked] = useState(false)

  useEffect(() => {
    if (!reunion) return
    setTitre(reunion.titre ?? '')
    setAnimateur(reunion.animateur ?? '')
    setData(reunion.sections_data ?? {})
    setPrivee(reunion.privee ?? false)
    setParticipants(reunion.participants ?? [])
    setTerminee(reunion.terminee ?? false)
  }, [reunion?.id, reunion?.created_at])  // eslint-disable-line react-hooks/exhaustive-deps

  // Lecture seule pour tout le monde une fois la réunion terminée, sauf pour
  // un admin qui a explicitement déverrouillé (cadenas dans la topbar).
  const isLocked = terminee && !(isAdmin && adminUnlocked)

  function patch(p: Partial<SectionsData>) { setData(d => ({ ...d, ...p })) }

  async function save(overrides?: Partial<{ terminee: boolean }>) {
    if (!reunionId) return
    await update.mutateAsync({ id: reunionId, updates: {
      titre: titre.trim() || null, animateur: animateur.trim() || null,
      sections_data: data, privee, participants,
      terminee: overrides?.terminee ?? terminee,
    } })
  }

  // Autosave débouncé (~800ms après la dernière saisie) — plus de bouton
  // "Sauvegarder" : chaque champ se persiste tout seul, tant que la réunion
  // affichée est chargée (dataReady) et modifiable (isLocked bloque de toute
  // façon les champs eux-mêmes, cf. <fieldset disabled> plus bas — cette
  // garde est une sécurité en plus).
  const dataReady = !isLoading && !!reunion
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dataReady || isLocked) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => { save() }, 800)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, isLocked, titre, animateur, data, privee, participants, terminee])

  // "Terminer la réunion" : flush immédiat (sans attendre le debounce),
  // marque la réunion comme terminée (verrouillée), puis retour à la liste.
  // `date_reunion` n'est jamais touchée par save() — la date d'origine est
  // donc automatiquement conservée, y compris après un futur déverrouillage.
  async function handleFinish() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    setTerminee(true)
    await save({ terminee: true })
    toast('Réunion terminée')
    navigate('/reunions')
  }

  async function supprimer() {
    if (!reunionId) return
    // Sécurité en plus du bouton masqué : une réunion terminée ne se
    // supprime que par un admin.
    if (terminee && !isAdmin) return
    const ok = await confirm({ title: 'Supprimer cette réunion ?', message: 'Le compte-rendu et son contenu seront définitivement supprimés.', confirmLabel: 'Supprimer', variant: 'danger' })
    if (!ok) return
    await remove.mutateAsync(reunionId)
    navigate('/reunions')
  }

  if (isLoading) return <Layout><Spinner /></Layout>
  if (!reunion) return (
    <Layout>
      <div className="ds-card text-sm text-subtle">Réunion introuvable. <button className="text-indigo-600 font-semibold" onClick={() => navigate('/reunions')}>Retour aux réunions</button></div>
    </Layout>
  )

  const sections = (type?.sections ?? ['notes']).filter((s): s is Exclude<SectionKey, 'revue_produits'> => s !== 'revue_produits')
  const actions   = data.actions   ?? []
  const decisions = data.decisions ?? []
  const risques   = data.risques   ?? []
  const objectifs = data.objectifs ?? []

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5 print:hidden gap-y-2">
        <button onClick={() => navigate('/reunions')} className="ds-btn ds-btn-sm flex items-center gap-1.5 shrink-0">
          <ArrowLeft size={13} /> Réunions
        </button>
        {type && (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0"
            style={{ background: type.couleur + '1A', color: type.couleur, border: `1px solid ${type.couleur}33` }}>
            {type.nom}
          </span>
        )}
        <fieldset disabled={isLocked} className="contents">
          <input value={titre} onChange={e => setTitre(e.target.value)}
            className="flex-1 min-w-[140px] bg-transparent text-sm font-bold text-navy outline-none placeholder:text-subtle/40 disabled:opacity-60"
            placeholder="Titre de la réunion…" />
        </fieldset>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <fieldset disabled={isLocked} className="contents">
            <input value={animateur} onChange={e => setAnimateur(e.target.value)}
              className="ds-input text-xs w-32 hidden md:block disabled:opacity-60" placeholder="Animateur…" />
          </fieldset>
          <button onClick={() => window.print()} className="ds-btn ds-btn-sm flex items-center gap-1.5">
            <Printer size={13} /> PDF
          </button>
          {(!terminee || isAdmin) && (
            <button onClick={supprimer} className="ds-btn ds-btn-sm text-rose-500 hover:bg-rose-50" title="Supprimer la réunion">
              <Trash2 size={13} />
            </button>
          )}
          {!terminee ? (
            <button onClick={handleFinish} disabled={update.isPending}
              className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
              <Check size={13} /> {update.isPending ? 'Sauvegarde…' : 'Terminer la réunion'}
            </button>
          ) : isAdmin ? (
            <button onClick={() => setAdminUnlocked(v => !v)}
              className={cn('ds-btn-sm flex items-center gap-1.5 rounded-lg border font-semibold transition-colors px-2.5 py-1.5',
                adminUnlocked ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-card text-subtle border-border hover:text-navy')}
              title={adminUnlocked ? 'Reverrouiller la réunion' : 'Déverrouiller pour modifier (admin)'}>
              {adminUnlocked ? <Unlock size={13} /> : <Lock size={13} />}
              {adminUnlocked ? 'Déverrouillée' : 'Terminée'}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-subtle bg-bg border border-border rounded-lg px-2.5 py-1.5">
              <Lock size={13} /> Terminée
            </span>
          )}
        </div>
      </div>

      {/* En-tête d'impression */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold text-navy">{titre || type?.nom || 'Réunion'}</h1>
        <p className="text-sm text-gray-600">
          {reunion.date_reunion && new Date(reunion.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {animateur && ` · Animateur : ${animateur}`}
          {produit && ` · ${produit.nom}`}
        </p>
      </div>

      {/* Méta + sections : verrouillées en lecture seule une fois la réunion
          terminée (sauf admin déverrouillé, cf. isLocked) — fieldset natif
          plutôt qu'un disabled par champ (bloque effectivement tous les
          inputs/selects/textareas/boutons imbriqués). */}
      <fieldset disabled={isLocked} className={cn('border-0 p-0 m-0 min-w-0', isLocked && 'opacity-70')}>
      {/* Méta */}
      <div className="flex items-center gap-2.5 flex-wrap mb-5 print:hidden">
        <span className="text-xs text-subtle">
          {reunion.date_reunion && new Date(reunion.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        {produit && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-navy bg-card border border-border rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: produit.couleur ?? '#4A4CC8' }} />
            {produit.nom}
          </span>
        )}

        <div className="ds-sep" />

        {/* Visibilité */}
        <button onClick={() => setPrivee(v => !v)}
          title={privee ? 'Réunion privée — visible par le créateur, les participants et les admins' : 'Réunion visible selon le produit lié (ou par tous si transverse)'}
          className={cn('flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border transition-all',
            privee ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-card text-subtle border-border hover:text-navy')}>
          {privee ? <Lock size={11} /> : <Unlock size={11} />}
          {privee ? 'Privée' : 'Visible'}
        </button>

        {/* Participants */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {participants.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs font-semibold text-navy bg-card border border-border rounded-full px-2 py-0.5 group/part">
              {t}
              <button onClick={() => setParticipants(prev => prev.filter(x => x !== t))}
                className="text-subtle hover:text-rose-600"><X size={10} /></button>
            </span>
          ))}
          {addingPart ? (
            <select autoFocus className="text-xs border border-border rounded-full px-2 py-0.5 bg-card text-navy outline-none"
              onBlur={() => setAddingPart(false)}
              onChange={e => {
                const t = e.target.value
                if (t && !participants.includes(t)) setParticipants(prev => [...prev, t])
                setAddingPart(false)
              }}>
              <option value="">— Membre</option>
              {membresActifs.filter(m => m.trigramme && !participants.includes(m.trigramme)).map(m => (
                <option key={m.trigramme} value={m.trigramme!}>{m.trigramme} — {m.prenom ?? ''} {m.nom ?? ''}</option>
              ))}
            </select>
          ) : (
            <button onClick={() => setAddingPart(true)}
              className="flex items-center gap-1 text-xs text-subtle hover:text-indigo-600 border border-dashed border-border rounded-full px-2 py-0.5 transition-colors">
              <UserPlus size={11} /> Participant
            </button>
          )}
        </div>

        {privee && participants.length === 0 && (
          <span className="text-[11px] text-amber-600 font-medium">⚠ Sans participants, seuls toi et les admins verront cette réunion</span>
        )}
      </div>

      <div className="flex flex-col gap-4 max-w-4xl 3xl:max-w-6xl">
        {sections.map(key => {
          const def = SECTION_DEFS[key]

          if (key === 'objectifs') {
            return (
              <SectionCard key={key} title={`${def.label} (${objectifs.filter(o => !o.checked).length} restants)`} icon={def.icon}>
                <div className="flex flex-col gap-1.5">
                  {objectifs.map(o => (
                    <div key={o.id} className="flex items-center gap-2.5 group/obj">
                      <button onClick={() => patch({ objectifs: objectifs.map(x => x.id === o.id ? { ...x, checked: !x.checked } : x) })}
                        className={cn('w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                          o.checked ? 'bg-emerald-50 border-emerald-300' : 'border-border hover:border-emerald-400')}>
                        {o.checked && <Check size={10} className="text-emerald-600" />}
                      </button>
                      <span className={cn('flex-1 text-sm', o.checked ? 'line-through text-subtle/50' : 'text-navy')}>{o.texte}</span>
                      <button onClick={() => patch({ objectifs: objectifs.filter(x => x.id !== o.id) })}
                        className="max-md:opacity-100 opacity-0 group-hover/obj:opacity-100 text-subtle hover:text-rose-600 transition-all print:hidden"><X size={12} /></button>
                    </div>
                  ))}
                  <AddLine placeholder="Nouvel objectif… (Entrée pour ajouter)"
                    onAdd={t => patch({ objectifs: [...objectifs, { id: uid(), texte: t, checked: false } satisfies ObjectifItem] })} />
                </div>
              </SectionCard>
            )
          }

          if (key === 'notes' || key === 'jalons') {
            return (
              <SectionCard key={key} title={def.label} icon={def.icon}>
                <MentionField as="textarea" value={data[key] ?? ''} onChange={v => patch({ [key]: v })}
                  membres={membresActifs} className="ds-textarea text-sm w-full" rows={6}
                  placeholder={def.placeholder} />
              </SectionCard>
            )
          }

          if (key === 'actions') {
            return (
              <SectionCard key={key} title={`${def.label} (${actions.filter(a => !a.done).length} ouvertes)`} icon={def.icon}>
                <div className="flex flex-col gap-1.5">
                  {actions.map(a => (
                    <div key={a.id} className="flex items-center gap-2.5 group/act">
                      <button onClick={() => patch({ actions: actions.map(x => x.id === a.id ? { ...x, done: !x.done } : x) })}
                        className={cn('w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                          a.done ? 'bg-emerald-50 border-emerald-300' : 'border-border hover:border-emerald-400')}>
                        {a.done && <Check size={10} className="text-emerald-600" />}
                      </button>
                      <span className={cn('flex-1 text-sm', a.done ? 'line-through text-subtle/50' : 'text-navy')}>{a.titre}</span>
                      <select value={a.assigne} onChange={e => patch({ actions: actions.map(x => x.id === a.id ? { ...x, assigne: e.target.value } : x) })}
                        className="text-xs border border-border rounded-lg px-2 py-1 bg-card text-navy w-28 print:border-0">
                        <option value="">— Assigné</option>
                        {membresActifs.filter(m => m.trigramme).map(m => <option key={m.trigramme} value={m.trigramme!}>{m.trigramme}</option>)}
                      </select>
                      <button onClick={() => patch({ actions: actions.filter(x => x.id !== a.id) })}
                        className="max-md:opacity-100 opacity-0 group-hover/act:opacity-100 text-subtle hover:text-rose-600 transition-all print:hidden"><X size={12} /></button>
                    </div>
                  ))}
                  <AddLine placeholder="Nouvelle action… (Entrée pour ajouter)"
                    onAdd={t => patch({ actions: [...actions, { id: uid(), titre: t, assigne: '', done: false } satisfies ActionItem] })} />
                </div>
              </SectionCard>
            )
          }

          if (key === 'decisions') {
            return (
              <SectionCard key={key} title={def.label} icon={def.icon}>
                <div className="flex flex-col gap-1.5">
                  {decisions.map(d => (
                    <div key={d.id} className="flex items-start gap-2.5 group/dec">
                      <Gavel size={12} className="text-indigo-400 mt-1 shrink-0" />
                      <span className="flex-1 text-sm text-navy leading-snug">{d.texte}</span>
                      <button onClick={() => patch({ decisions: decisions.filter(x => x.id !== d.id) })}
                        className="max-md:opacity-100 opacity-0 group-hover/dec:opacity-100 text-subtle hover:text-rose-600 transition-all print:hidden"><X size={12} /></button>
                    </div>
                  ))}
                  <AddLine placeholder="Nouvelle décision… (Entrée pour ajouter)"
                    onAdd={t => patch({ decisions: [...decisions, { id: uid(), texte: t } satisfies DecisionItem] })} />
                </div>
              </SectionCard>
            )
          }

          // risques
          return (
            <SectionCard key={key} title={def.label} icon={def.icon}>
              <div className="flex flex-col gap-1.5">
                {risques.map(r => (
                  <div key={r.id} className="flex items-center gap-2.5 group/rsk">
                    <div className="flex rounded-lg border border-border overflow-hidden shrink-0 print:hidden">
                      {(['vert', 'orange', 'rouge'] as const).map(n => (
                        <button key={n} onClick={() => patch({ risques: risques.map(x => x.id === r.id ? { ...x, niveau: n } : x) })}
                          title={n}
                          className={cn('w-5 h-5 flex items-center justify-center transition-colors',
                            r.niveau === n ? '' : 'opacity-25 hover:opacity-60')}>
                          <span className={cn('w-2.5 h-2.5 rounded-full',
                            n === 'vert' ? 'bg-emerald-400' : n === 'orange' ? 'bg-amber-400' : 'bg-rose-500')} />
                        </button>
                      ))}
                    </div>
                    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase shrink-0', NIVEAU_STYLE[r.niveau])}>{r.niveau}</span>
                    <span className="flex-1 text-sm text-navy leading-snug">{r.texte}</span>
                    <button onClick={() => patch({ risques: risques.filter(x => x.id !== r.id) })}
                      className="max-md:opacity-100 opacity-0 group-hover/rsk:opacity-100 text-subtle hover:text-rose-600 transition-all print:hidden"><X size={12} /></button>
                  </div>
                ))}
                <AddLine placeholder="Nouveau risque ou blocage… (Entrée pour ajouter)"
                  onAdd={t => patch({ risques: [...risques, { id: uid(), texte: t, niveau: 'orange' } satisfies RisqueItem] })} />
              </div>
            </SectionCard>
          )
        })}
      </div>
      </fieldset>
    </Layout>
  )
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (texte: string) => void }) {
  const [v, setV] = useState('')
  function add() { const t = v.trim(); if (!t) return; onAdd(t); setV('') }
  return (
    <div className="flex items-center gap-2 mt-1.5 print:hidden">
      <Plus size={13} className="text-subtle/40 shrink-0" />
      <input value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }}
        className="flex-1 text-sm bg-transparent outline-none text-navy placeholder:text-subtle/40 border-b border-transparent focus:border-indigo-300 transition-colors py-1"
        placeholder={placeholder} />
      {v.trim() && <button onClick={add} className="ds-btn-primary ds-btn-sm shrink-0">Ajouter</button>}
    </div>
  )
}
