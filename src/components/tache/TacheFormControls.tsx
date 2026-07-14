import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOSCOW_LIST } from '@/constants'

// Contrôles de formulaire partagés entre la page Tâches (création, édition
// en masse) et le panneau de détail TacheDetailPanel — extraits de
// TachesPage.tsx à l'identique lors de la réutilisation du panneau par Setup.

// ── PriorityPicker ────────────────────────────────────────────
const PRIO_CONFIG: Record<string, { idle: string; active: string }> = {
  P1: { idle: 'bg-rose-50   text-rose-500   border border-rose-200',   active: 'bg-rose-500   text-white border border-rose-500' },
  P2: { idle: 'bg-amber-50  text-amber-600  border border-amber-200',  active: 'bg-amber-400  text-white border border-amber-400' },
  P3: { idle: 'bg-indigo-50 text-indigo-500 border border-indigo-200', active: 'bg-indigo-500 text-white border border-indigo-500' },
  P4: { idle: 'bg-slate-50  text-slate-400  border border-slate-200',  active: 'bg-slate-400  text-white border border-slate-400' },
}
export function PriorityPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  return (
    <div className="flex gap-1">
      {Object.keys(PRIO_CONFIG).map(p => (
        <button key={p} type="button" onClick={() => onChange(p)}
          className={cn('px-2.5 py-1 rounded-lg text-xs font-bold transition-all', value === p ? PRIO_CONFIG[p].active : PRIO_CONFIG[p].idle)}>
          {p}
        </button>
      ))}
    </div>
  )
}

export function Label({children}:{children:React.ReactNode}) {
  return <label className="text-xs font-bold text-navy/75 uppercase tracking-wide mb-1 block">{children}</label>
}
export function Grp({label,children,col2,className}:{label:React.ReactNode;children:React.ReactNode;col2?:boolean;className?:string}) {
  return <div className={cn(col2?'col-span-2':'',className)}>
    <Label>{label}</Label>{children}
  </div>
}

// ── SelectPicker (variante locale, distincte de ui/SelectPicker) ──
export interface PickerOption { value:string; label:string }
export function SelectPicker({value,onChange,options,placeholder='--',searchable=false,className=''}:{
  value:string;onChange:(v:string)=>void;options:PickerOption[]
  placeholder?:string;searchable?:boolean;className?:string
}){
  const [open,setOpen]=useState(false)
  const [q,setQ]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open){setQ('');return}
    function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node)){setOpen(false);setQ('')}}
    document.addEventListener('mousedown',h)
    return()=>document.removeEventListener('mousedown',h)
  },[open])
  const filtered=q?options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())):options
  const label=options.find(o=>o.value===value)?.label
  return(
    <div className={cn('relative',className)} ref={ref}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-card text-xs text-left hover:border-indigo-300 transition-colors">
        <span className={cn('flex-1 truncate',value?'text-navy font-medium':'text-slate-400')}>{label??placeholder}</span>
        <ChevronDown size={11} className={cn('text-slate-300 shrink-0 transition-transform',open&&'rotate-180')}/>
      </button>
      {open&&(
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-slate-200 rounded-xl shadow-lg overflow-hidden" style={{minWidth:'100%',maxWidth:'320px'}}>
          {searchable&&(
            <div className="px-2 pt-2 pb-1.5 border-b border-slate-100">
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-indigo-300"
                placeholder="Rechercher…"/>
            </div>
          )}
          <div className="overflow-y-auto" style={{maxHeight:'200px'}}>
            <button type="button" onClick={()=>{onChange('');setOpen(false)}}
              className={cn('w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-slate-50',
                !value?'text-indigo-600 bg-indigo-50 font-medium':'text-slate-400')}>
              {placeholder}
            </button>
            {filtered.map(o=>(
              <button key={o.value} type="button" onClick={()=>{onChange(o.value);setOpen(false)}}
                className={cn('w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-slate-50',
                  value===o.value?'bg-indigo-50 text-indigo-600 font-semibold':'text-navy')}>
                {o.label}
              </button>
            ))}
            {filtered.length===0&&<div className="px-3 py-3 text-xs text-slate-400 text-center italic">Aucun résultat</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MoSCoWPicker ──────────────────────────────────────────────
const MOSCOW_MAP:{[k:string]:{idle:string;active:string;short:string}}={
  'Must Have':  {idle:'bg-slate-100 text-navy border-slate-300',      active:'bg-brand text-white border-navy',              short:'Must'},
  'Should Have':{idle:'bg-indigo-50 text-indigo-600 border-indigo-200',active:'bg-indigo-500 text-white border-indigo-500', short:'Should'},
  'Could Have': {idle:'bg-slate-50 text-slate-500 border-slate-200',   active:'bg-slate-400 text-white border-slate-400',   short:'Could'},
  "Won't Have": {idle:'bg-rose-50 text-rose-400 border-rose-200',      active:'bg-rose-400 text-white border-rose-400',     short:"Won't"},
}
export function MoSCoWPicker({value,onChange}:{value:string;onChange:(v:string)=>void}){
  return(
    <div className="flex flex-wrap gap-1">
      {MOSCOW_LIST.map(m=>{
        const c=MOSCOW_MAP[m]??{idle:'bg-slate-50 text-slate-500 border-slate-200',active:'bg-slate-400 text-white border-slate-400',short:m}
        return(
          <button key={m} type="button" onClick={()=>onChange(m)}
            className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',value===m?c.active:c.idle)}>
            {c.short}
          </button>
        )
      })}
    </div>
  )
}
