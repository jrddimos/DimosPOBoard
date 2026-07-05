import { useState } from 'react'
import { X, Plus, Trash2, Calendar, Building2 } from 'lucide-react'
import { getJoursFeries } from '@/utils/joursFeries'
import {
  usePeriodesFermeture,
  useCreatePeriodeFermeture,
  useDeletePeriodeFermeture,
} from '@/hooks/usePeriodesFermeture'

interface Props {
  annee:   number
  onClose: () => void
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function PlanChargesSettings({ annee, onClose }: Props) {
  const feries   = getJoursFeries(annee)
  const { data: fermetures = [], isLoading } = usePeriodesFermeture(annee)
  const create   = useCreatePeriodeFermeture()
  const remove   = useDeletePeriodeFermeture()

  const [form, setForm] = useState({
    label:      '',
    date_debut: `${annee}-01-01`,
    date_fin:   `${annee}-01-01`,
  })
  const [showForm, setShowForm] = useState(false)

  async function handleCreate() {
    if (!form.label.trim() || !form.date_debut || !form.date_fin) return
    if (form.date_fin < form.date_debut) return
    await create.mutateAsync({ annee, label: form.label.trim(), date_debut: form.date_debut, date_fin: form.date_fin })
    setForm({ label: '', date_debut: `${annee}-01-01`, date_fin: `${annee}-01-01` })
    setShowForm(false)
  }

  // Nombre de jours ouvrés concernés par une fermeture
  function joursOuvresFermeture(debut: string, fin: string): number {
    let count = 0
    const d = new Date(debut)
    const fSet = new Set(feries.map(f => f.iso))
    while (toISO(d) <= fin) {
      const dow = d.getDay()  // 0=dim, 6=sam
      if (dow !== 0 && dow !== 6 && !fSet.has(toISO(d))) count++
      d.setDate(d.getDate() + 1)
    }
    return count
  }

  function toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-96 bg-card shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-brand/3">
          <div>
            <h2 className="text-sm font-bold text-navy">Paramètres plan de charges</h2>
            <p className="text-[11px] text-subtle mt-0.5">Définit les jours non-ouvrés pour {annee}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 text-subtle hover:text-navy transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ── Jours fériés ───────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={13} className="text-orange shrink-0" />
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
                Jours fériés {annee}
              </h3>
              <span className="ml-auto text-[11px] text-subtle bg-orange/10 text-orange px-1.5 py-0.5 rounded-full font-semibold">
                {feries.length} jours
              </span>
            </div>
            <div className="space-y-1">
              {feries.map(f => (
                <div key={f.iso}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-orange/5 border border-orange/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange shrink-0" />
                  <span className="text-xs font-semibold text-navy/70 tabular-nums w-16 shrink-0">
                    {fmtDate(f.iso)}
                  </span>
                  <span className="text-xs text-navy flex-1">{f.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-subtle mt-2 italic">
              Calculés automatiquement pour la France métropolitaine.
            </p>
          </section>

          {/* ── Fermetures société ─────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={13} className="text-purple shrink-0" />
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
                Fermetures société
              </h3>
              <button onClick={() => setShowForm(v => !v)}
                className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-purple hover:bg-purple/10 px-2 py-1 rounded-lg transition-colors">
                <Plus size={11} />
                Ajouter
              </button>
            </div>

            {/* Formulaire ajout */}
            {showForm && (
              <div className="mb-3 p-3 rounded-xl bg-purple/5 border border-purple/20 space-y-2">
                <input
                  type="text"
                  placeholder="Libellé (ex: Congés été)"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="ds-input w-full text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="ds-label mb-1">Du</label>
                    <input type="date" value={form.date_debut}
                      min={`${annee}-01-01`} max={`${annee}-12-31`}
                      onChange={e => setForm(f => ({ ...f, date_debut: e.target.value, date_fin: e.target.value > f.date_fin ? e.target.value : f.date_fin }))}
                      className="ds-input w-full text-xs" />
                  </div>
                  <div>
                    <label className="ds-label mb-1">Au</label>
                    <input type="date" value={form.date_fin}
                      min={form.date_debut} max={`${annee}-12-31`}
                      onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                      className="ds-input w-full text-xs" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowForm(false)} className="ds-btn ds-btn-sm text-xs">
                    Annuler
                  </button>
                  <button onClick={handleCreate} disabled={create.isPending || !form.label.trim()}
                    className="ds-btn-primary ds-btn-sm text-xs">
                    {create.isPending ? 'Enregistrement…' : 'Ajouter'}
                  </button>
                </div>
              </div>
            )}

            {/* Liste fermetures */}
            {isLoading ? (
              <div className="text-xs text-subtle py-2">Chargement…</div>
            ) : fermetures.length === 0 ? (
              <div className="text-xs text-subtle italic py-2">
                Aucune fermeture définie pour {annee}
              </div>
            ) : (
              <div className="space-y-1.5">
                {fermetures.map(f => {
                  const jours = joursOuvresFermeture(f.date_debut, f.date_fin)
                  const nbDays = Math.round((new Date(f.date_fin).getTime() - new Date(f.date_debut).getTime()) / 86400000) + 1
                  return (
                    <div key={f.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-purple/5 border border-purple/15 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-navy truncate">{f.label}</div>
                        <div className="text-[11px] text-subtle tabular-nums">
                          {fmtDate(f.date_debut)}
                          {f.date_debut !== f.date_fin && ` → ${fmtDate(f.date_fin)}`}
                          {' '}· {nbDays} jour{nbDays > 1 ? 's' : ''} calendaires, {jours} ouvré{jours > 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => remove.mutate({ id: f.id, annee })}
                        disabled={remove.isPending}
                        className="p-1 rounded max-md:opacity-100 opacity-0 group-hover:opacity-100 hover:bg-red/10 text-subtle hover:text-red transition-all shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Impact résumé ───────────────────────────────────── */}
          {(feries.length > 0 || fermetures.length > 0) && (
            <section className="p-3 rounded-xl bg-brand/5 border border-navy/10">
              <div className="text-[11px] font-bold text-navy uppercase tracking-wider mb-2">
                Impact sur {annee}
              </div>
              <div className="text-xs text-subtle space-y-1">
                <div>· <strong className="text-navy">{feries.length}</strong> jours fériés légaux</div>
                <div>· <strong className="text-navy">{fermetures.length}</strong> période{fermetures.length > 1 ? 's' : ''} de fermeture</div>
                <div className="text-[11px] mt-2 italic">
                  Ces données limitent automatiquement la saisie dans le tableau — impossible de saisir plus de jours que les jours ouvrés disponibles par semaine.
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
