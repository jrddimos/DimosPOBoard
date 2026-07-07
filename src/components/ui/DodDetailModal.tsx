import { Modal } from '@/components/ui/Modal'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DodItem, ExigenceType, ExigenceCriticite } from '@/hooks/useDod'

const TYPE_LABEL: Record<ExigenceType, string> = {
  fonctionnelle: 'Fonctionnelle', performance: 'Performance', securite: 'Sécurité', cout: 'Coût',
}
const CRITICITE_LABEL: Record<ExigenceCriticite, string> = {
  haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse',
}

export function DodDetailModal({ item, onClose }: { item: DodItem | null; onClose: () => void }) {
  return (
    <Modal open={!!item} onClose={onClose} title={item?.code ?? ''} size="sm">
      {item && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.categorie && (
              <span className="text-[11px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                {item.categorie}
              </span>
            )}
            <span className="text-[11px] font-bold text-navy/70 bg-bg px-2 py-0.5 rounded-full uppercase tracking-wide">
              {TYPE_LABEL[item.type] ?? item.type} · {CRITICITE_LABEL[item.criticite] ?? item.criticite}
            </span>
            {item.verifiee && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green bg-green/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                <ShieldCheck size={11} /> Vérifiée
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-navy">{item.titre}</h3>
          {item.description && <p className="text-xs text-subtle whitespace-pre-wrap">{item.description}</p>}
          {(item.valeur_cible || item.valeur_constatee) && (
            <p className="text-xs">
              <span className="text-subtle">Cible : </span>
              <span className="font-semibold text-navy">{item.valeur_cible ?? '—'}</span>
              <span className="text-subtle"> · Constaté : </span>
              <span className={cn('font-semibold', item.verifiee ? 'text-green' : 'text-navy')}>{item.valeur_constatee ?? '—'}</span>
            </p>
          )}
          {!item.actif && <p className="text-xs text-orange font-medium">Cette exigence est désactivée dans le référentiel.</p>}
        </div>
      )}
    </Modal>
  )
}
