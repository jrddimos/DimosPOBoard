import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronLeft, Users, Settings, CalendarClock, TrendingUp, Package, BarChart2, CheckSquare, ArrowLeftRight, Info, X, Search, HelpCircle, CalendarOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/ui/PageTitle'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { PlanMode } from './utils'

// Popover d'aide (portal : la topbar a un overflow-x qui rognerait un absolute)
function HelpPopover() {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 320
    setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - width - 12) })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)} title="Légende et raccourcis"
        className={cn('p-1.5 rounded-lg transition-colors', open ? 'bg-indigo-50 text-indigo-600' : 'text-subtle hover:text-navy hover:bg-bg')}>
        <HelpCircle size={14} />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} className="fixed z-[10050] w-[320px] bg-card border border-border rounded-xl shadow-modal p-4 animate-in"
          style={{ top: pos.top, left: pos.left }}>
          <div className="text-xs font-bold text-navy uppercase tracking-wide mb-2.5">Légende</div>
          <div className="flex flex-col gap-2 text-xs text-subtle">
            <span className="flex items-center gap-2"><span className="inline-block w-2.5 h-3 rounded-t-sm bg-indigo-500 shrink-0" /> hauteur de barre = % de charge de la semaine</span>
            <span className="flex items-center gap-2"><span className="inline-block w-2.5 h-3 rounded-t-sm bg-rose-500 shrink-0" /> dépassement de capacité</span>
            <span className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" /> absence du membre (capacité réduite)</span>
            <span className="flex items-center gap-2"><Users size={11} className="shrink-0" /> N = membres — cliquez pour déplier</span>
            <span className="flex items-center gap-2"><CalendarOff size={11} className="shrink-0 text-amber-500" /> gérer les absences (vue membre)</span>
          </div>
          <div className="text-xs font-bold text-navy uppercase tracking-wide mt-3.5 mb-2.5">Saisie clavier</div>
          <div className="flex flex-col gap-1.5 text-xs text-subtle">
            <span><kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">Entrée</kbd> / <kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">→</kbd> valider et passer à la semaine suivante</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">Maj+Entrée</kbd> / <kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">←</kbd> semaine précédente</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">↓</kbd> membre précédent / suivant</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border bg-bg font-mono text-[10px]">Échap</kbd> annuler · cliquer-glisser = remplissage groupé</span>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function PlanChargesTopbar({
  annee, setAnnee, curYear, scrollToToday,
  viewMode, setViewMode, memberSearch, setMemberSearch,
  mode, setMode,
  setShowSettings,
  showTip, setShowTip,
}: {
  annee: number; setAnnee: Dispatch<SetStateAction<number>>; curYear: number; scrollToToday: () => void
  viewMode: 'produit' | 'membre'; setViewMode: Dispatch<SetStateAction<'produit' | 'membre'>>
  memberSearch: string; setMemberSearch: Dispatch<SetStateAction<string>>
  mode: PlanMode; setMode: Dispatch<SetStateAction<PlanMode>>
  setShowSettings: Dispatch<SetStateAction<boolean>>
  showTip: boolean; setShowTip: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <>
      <div className="page-topbar -mx-3 -mt-3 mb-4 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <PageTitle icon={<TrendingUp size={15}/>} label="Plan de charges" />

          <div className="flex items-center gap-1">
            <button onClick={() => setAnnee(a => a - 1)} aria-label="Année précédente" title="Année précédente"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))} aria-label="Année"
              className="ds-select text-xs py-1 w-20 text-center">
              {[curYear - 2, curYear - 1, curYear, curYear + 1, curYear + 2].map(y => <option key={y}>{y}</option>)}
            </select>
            <button onClick={() => setAnnee(a => a + 1)} aria-label="Année suivante" title="Année suivante"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>

          {annee === curYear && (
            <button onClick={scrollToToday}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
              <CalendarClock size={13} aria-hidden="true" />
              Aujourd'hui
            </button>
          )}

          {/* Toggle vue */}
          <ToggleGroup value={viewMode} onChange={setViewMode} options={[
            { key: 'produit', label: 'Par produit', icon: <Package size={11}/> },
            { key: 'membre',  label: 'Par membre',  icon: <Users size={11}/> },
          ]} />

          {viewMode === 'membre' && (
            <div className="ds-searchbar w-40">
              <Search size={12} className="text-subtle shrink-0" aria-hidden="true" />
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                placeholder="Rechercher un membre…" aria-label="Rechercher un membre" />
              {memberSearch && (
                <button onClick={() => setMemberSearch('')} aria-label="Effacer la recherche">
                  <X size={11} className="text-subtle" />
                </button>
              )}
            </div>
          )}

          {/* Toggle mode */}
          <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
            {([
              { key: 'previsionnel', label: 'Prévisionnel', icon: <BarChart2 size={11}/>      },
              { key: 'realise',      label: 'Réalisé',       icon: <CheckSquare size={11}/>    },
              { key: 'comparaison',  label: 'Comparaison',   icon: <ArrowLeftRight size={11}/> },
            ] as const).map(m => (
              <button key={m.key} onClick={() => setMode(m.key as PlanMode)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                  mode === m.key
                    ? m.key === 'realise'     ? 'bg-card shadow-sm text-emerald-700'
                    : m.key === 'comparaison' ? 'bg-card shadow-sm text-amber-700'
                    :                           'bg-card shadow-sm text-navy'
                    : 'text-subtle hover:text-navy'
                )}>
                {m.icon}{m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 ml-auto text-xs text-subtle items-center">
            <HelpPopover />
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 hover:text-navy transition-colors font-medium">
              <Settings size={13} aria-hidden="true" />
              Paramètres
            </button>
          </div>
        </div>
      </div>

      {showTip && viewMode === 'produit' && mode !== 'comparaison' && (
        <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 mb-3">
          <Info size={13} className="shrink-0" aria-hidden="true" />
          <span>Cliquez sur une cellule pour saisir une valeur, ou glissez sur plusieurs semaines pour un remplissage groupé.</span>
          <button onClick={() => { setShowTip(false); localStorage.setItem('pc-hideTip', '1') }}
            aria-label="Masquer l'astuce" className="ml-auto p-0.5 rounded hover:bg-indigo-100 text-indigo-400 hover:text-indigo-700 transition-colors">
            <X size={12} />
          </button>
        </div>
      )}
    </>
  )
}
