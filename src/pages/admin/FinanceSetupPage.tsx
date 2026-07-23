import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/hooks/useToast'
import { useFinanceConfig, useUpdateFinanceConfig } from '@/hooks/useFinanceConfig'
import type { EquipeTjm, TrimConfig } from '@/hooks/useFinanceConfig'
import { useEquipes } from '@/hooks/useEquipes'
import { Plus, X, Save, Calendar, Users, Wand2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function FinanceSetupPage() {
  const { data: config, isLoading: loadingConfig } = useFinanceConfig()
  const { data: equipes = [], isLoading: loadingEquipes } = useEquipes()
  const updateConfig = useUpdateFinanceConfig()
  const toast = useToast()

  const [joursParTrim, setJoursParTrim] = useState(65)
  const [equipeTjms,   setEquipeTjms]   = useState<EquipeTjm[]>([])
  const [trimestres,   setTrimestres]   = useState<TrimConfig[]>([])
  const [genYear,      setGenYear]      = useState(new Date().getFullYear())
  const [dirty,        setDirty]        = useState(false)

  useEffect(() => {
    if (config) {
      setJoursParTrim(config.jours_par_trim)
      setEquipeTjms(config.equipe_tjms)
      setTrimestres(config.trimestres)
      setDirty(false)
    }
  }, [config])

  // ── TJM équipes ─────────────────────────────────────────────
  function getTjm(equipe_id: number) {
    return equipeTjms.find(e => e.equipe_id === equipe_id)?.tjm ?? 0
  }
  function setTjm(equipe_id: number, tjm: number) {
    setEquipeTjms(prev => {
      const exists = prev.find(e => e.equipe_id === equipe_id)
      if (exists) return prev.map(e => e.equipe_id === equipe_id ? { ...e, tjm } : e)
      return [...prev, { equipe_id, tjm }]
    })
    setDirty(true)
  }

  // ── Trimestres ───────────────────────────────────────────────
  function generateYear() {
    const existing = new Set(trimestres.map(t => t.id))
    const toAdd: TrimConfig[] = []
    for (let q = 1; q <= 4; q++) {
      const id = `Q${q}-${genYear}`
      if (!existing.has(id)) toAdd.push({ id, label: `Q${q} ${genYear}`, jours_ouvres: joursParTrim })
    }
    if (toAdd.length === 0) { toast('Ces trimestres existent déjà'); return }
    setTrimestres(t => [...t, ...toAdd].sort((a, b) => a.id.localeCompare(b.id)))
    setDirty(true)
  }
  function updateTrimestre(id: string, field: keyof TrimConfig, value: string | number) {
    setTrimestres(ts => ts.map(t => t.id === id ? { ...t, [field]: value } : t))
    setDirty(true)
  }
  function removeTrimestre(id: string) {
    setTrimestres(ts => ts.filter(t => t.id !== id))
    setDirty(true)
  }

  // ── Sauvegarde ───────────────────────────────────────────────
  async function handleSave() {
    try {
      await updateConfig.mutateAsync({ jours_par_trim: joursParTrim, equipe_tjms: equipeTjms, trimestres })
      toast('Configuration financière enregistrée')
      setDirty(false)
    } catch {
      toast('Erreur lors de l\'enregistrement', 'error')
    }
  }

  const isLoading = loadingConfig || loadingEquipes
  const activeEquipes = equipes.filter(e => e.actif)

  // ── Récap financier ──────────────────────────────────────────
  const recap = useMemo(() => {
    const equipesAvecTjm = activeEquipes.filter(eq => getTjm(eq.id) > 0)
    const budgetTotal    = equipesAvecTjm.reduce((s, eq) => s + getTjm(eq.id) * joursParTrim, 0)
    const tjmMoyen       = equipesAvecTjm.length > 0
      ? Math.round(equipesAvecTjm.reduce((s, eq) => s + getTjm(eq.id), 0) / equipesAvecTjm.length)
      : 0
    const nbTrimestres   = trimestres.length
    const budgetAnnuel   = nbTrimestres > 0
      ? equipesAvecTjm.reduce((s, eq) => {
          const joursTotal = trimestres.reduce((js, t) => js + t.jours_ouvres, 0)
          return s + getTjm(eq.id) * joursTotal
        }, 0)
      : 0
    return { equipesAvecTjm: equipesAvecTjm.length, budgetTotal, tjmMoyen, budgetAnnuel, nbTrimestres }
  // getTjm ne lit que `equipeTjms`, déjà en dépendance — pas besoin de la
  // lister séparément (fonction non mémoïsée, recréée chaque rendu).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEquipes, equipeTjms, joursParTrim, trimestres])

  if (isLoading) return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Chargement…</div>
  )

  return (
    <div>
      {/* Barre d'actions locale (le titre est déjà porté par l'onglet "Finance") */}
      <div className="flex items-center justify-end mb-4">
        <button onClick={handleSave} disabled={!dirty || updateConfig.isPending}
          className={cn(
            'ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-40 transition-all',
            dirty && 'animate-pulse'
          )}>
          <Save size={13}/> {updateConfig.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Bandeau "modifications non sauvegardées" */}
      {dirty && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
          <AlertCircle size={13} className="shrink-0" />
          Modifications non sauvegardées — pensez à enregistrer avant de quitter.
        </div>
      )}

      <div className="max-w-3xl 3xl:max-w-5xl mx-auto space-y-5">

        {/* ── Bandeau récap ── */}
        {recap.equipesAvecTjm > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Équipes configurées',
                value: `${recap.equipesAvecTjm} / ${activeEquipes.length}`,
                sub:   'avec un TJM',
                color: 'bg-slate-50 border-slate-200',
                text:  'text-slate-600',
              },
              {
                label: 'TJM moyen',
                value: `${recap.tjmMoyen.toLocaleString('fr-FR')} €`,
                sub:   'par équipe',
                color: 'bg-indigo-50 border-indigo-200',
                text:  'text-indigo-700',
              },
              {
                label: 'Coût total / trim.',
                value: `${recap.budgetTotal.toLocaleString('fr-FR')} €`,
                sub:   `toutes équipes · ${joursParTrim} jours`,
                color: 'bg-emerald-50 border-emerald-200',
                text:  'text-emerald-700',
              },
              {
                label: recap.nbTrimestres > 0 ? `Budget annuel (${recap.nbTrimestres} trim.)` : 'Budget annuel',
                value: recap.nbTrimestres > 0 ? `${recap.budgetAnnuel.toLocaleString('fr-FR')} €` : '—',
                sub:   recap.nbTrimestres > 0 ? 'toutes équipes · tous trim.' : 'configurez des trimestres',
                color: recap.nbTrimestres > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200',
                text:  recap.nbTrimestres > 0 ? 'text-amber-700' : 'text-slate-400',
              },
            ].map(card => (
              <div key={card.label} className={cn('rounded-xl border p-3', card.color)}>
                <div className="text-[11px] text-slate-500 font-medium mb-1">{card.label}</div>
                <div className={cn('text-lg font-bold tabular-nums leading-none', card.text)}>{card.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── TJM par équipe ── */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-navy" />
            <h2 className="text-xs font-bold text-navy uppercase tracking-wider">TJM par équipe</h2>
          </div>

          {activeEquipes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              Aucune équipe active — créez des équipes dans le menu Équipes.
            </p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {/* En-tête */}
              <div className="grid grid-cols-[1fr_120px_100px_130px] gap-0 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-border">
                <div className="px-4 py-2.5">Équipe</div>
                <div className="px-3 py-2.5 text-right border-l border-border">TJM (€/j)</div>
                <div className="px-3 py-2.5 text-right border-l border-border">Jours / ETP</div>
                <div className="px-3 py-2.5 text-right border-l border-border">Coût 1 ETP (€)</div>
              </div>

              {/* Lignes */}
              {activeEquipes.map((eq, i) => {
                const tjm     = getTjm(eq.id)
                const coutEtp = tjm * joursParTrim
                return (
                  <div key={eq.id}
                    className={cn('grid grid-cols-[1fr_120px_100px_130px] items-center border-b border-border/50 last:border-0',
                      i % 2 === 1 && 'bg-slate-50/60')}>
                    <div className="px-4 py-2.5 flex items-center gap-2">
                      {eq.couleur && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: eq.couleur }} />}
                      <span className="text-sm font-medium text-navy">{eq.nom}</span>
                    </div>
                    <div className="px-3 py-2 border-l border-border/50">
                      <div className="flex items-center gap-1 justify-end">
                        <input type="number" min="0" step="10" placeholder="0"
                          value={tjm || ''}
                          onChange={e => setTjm(eq.id, Number(e.target.value) || 0)}
                          className="ds-input text-sm text-right w-full" />
                        <span className="text-xs text-slate-400 shrink-0">€</span>
                      </div>
                    </div>
                    <div className="px-3 py-2.5 border-l border-border/50 text-right">
                      <span className="text-sm text-slate-400 tabular-nums">{joursParTrim}</span>
                    </div>
                    <div className="px-3 py-2.5 border-l border-border/50 text-right">
                      {coutEtp > 0
                        ? <span className="text-sm font-semibold text-navy tabular-nums">{coutEtp.toLocaleString('fr-FR')} €</span>
                        : <span className="text-slate-300 text-sm">—</span>
                      }
                    </div>
                  </div>
                )
              })}

              {/* Ligne moyenne */}
              {(() => {
                const withTjm = activeEquipes.filter(eq => getTjm(eq.id) > 0)
                if (withTjm.length < 2) return null
                const avg = Math.round(withTjm.reduce((s, eq) => s + getTjm(eq.id), 0) / withTjm.length)
                return (
                  <div className="grid grid-cols-[1fr_120px_100px_130px] items-center bg-slate-50 border-t border-slate-200">
                    <div className="px-4 py-2.5 text-xs font-bold text-slate-500">Moyenne</div>
                    <div className="px-3 py-2.5 border-l border-slate-200 text-right text-xs font-bold text-slate-600 tabular-nums">{avg.toLocaleString('fr-FR')} €</div>
                    <div className="px-3 py-2.5 border-l border-slate-200 text-right text-xs text-slate-400">{joursParTrim}</div>
                    <div className="px-3 py-2.5 border-l border-slate-200 text-right text-xs font-bold text-slate-600 tabular-nums">{(avg * joursParTrim).toLocaleString('fr-FR')} €</div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* ── Trimestres ── */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-navy" />
            <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Trimestres</h2>
          </div>

          {/* Jours par défaut */}
          <div className="flex items-center gap-4 pb-3 border-b border-border">
            <label className="text-sm text-slate-500 font-medium flex-1">
              Jours ouvrés par défaut
              <p className="text-xs text-slate-400 font-normal mt-0.5">Appliqué à la génération et dans le tableau ci-dessus</p>
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="100" step="1" value={joursParTrim}
                onChange={e => { setJoursParTrim(Number(e.target.value) || 65); setDirty(true) }}
                className="ds-input text-sm text-right w-20 font-semibold" />
              <span className="text-sm text-slate-400">jours</span>
            </div>
          </div>

          {/* Génération rapide */}
          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
            <Wand2 size={13} className="text-indigo-400 shrink-0" />
            <span className="text-xs text-indigo-600 flex-1">Générer les 4 trimestres pour</span>
            <input type="number" min="2020" max="2040" value={genYear}
              onChange={e => setGenYear(Number(e.target.value))}
              className="ds-input text-sm text-center w-20" />
            <button onClick={generateYear}
              className="ds-btn-primary ds-btn-sm flex items-center gap-1 whitespace-nowrap">
              <Plus size={11}/> Générer
            </button>
          </div>

          {/* Liste */}
          {trimestres.length > 0 ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_130px_36px] gap-0 px-3 py-2 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-border">
                <span>Trimestre</span>
                <span className="text-right">Jours ouvrés</span>
                <span/>
              </div>
              <div className="divide-y divide-border">
                {trimestres.map((t, i) => (
                  <div key={t.id} className={cn('grid grid-cols-[1fr_130px_36px] items-center px-3 py-2', i % 2 === 1 && 'bg-slate-50/60')}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0">{t.id}</span>
                      <input type="text" value={t.label}
                        onChange={e => updateTrimestre(t.id, 'label', e.target.value)}
                        className="ds-input text-sm flex-1 min-w-0" />
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <input type="number" min="1" max="100" value={t.jours_ouvres}
                        onChange={e => updateTrimestre(t.id, 'jours_ouvres', Number(e.target.value) || 65)}
                        className="ds-input text-sm text-right w-16" />
                      <span className="text-xs text-slate-400 shrink-0">j</span>
                    </div>
                    <button onClick={() => removeTrimestre(t.id)}
                      className="flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors">
                      <X size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-3">
              Aucun trimestre — utilisez la génération rapide ci-dessus.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
