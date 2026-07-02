import type { Dispatch, SetStateAction } from 'react'
import { ChevronRight, ChevronLeft, Users, Settings, CalendarClock, TrendingUp, Package, BarChart2, CheckSquare, ArrowLeftRight, Info, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/ui/PageTitle'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { PlanMode } from './utils'

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
              className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
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
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all',
                  mode === m.key
                    ? m.key === 'realise'     ? 'bg-white shadow-sm text-emerald-700'
                    : m.key === 'comparaison' ? 'bg-white shadow-sm text-amber-700'
                    :                           'bg-white shadow-sm text-navy'
                    : 'text-subtle hover:text-navy'
                )}>
                {m.icon}{m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 ml-auto text-xs text-subtle items-center">
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 hover:text-navy transition-colors font-medium">
              <Settings size={13} aria-hidden="true" />
              Paramètres
            </button>
          </div>
        </div>
      </div>

      {showTip && viewMode === 'produit' && mode !== 'comparaison' && (
        <div className="flex items-center gap-2 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 mb-3">
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
