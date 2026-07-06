import { Modal } from '@/components/ui/Modal'
import type { DodItem } from '@/hooks/useDod'

export function DodDetailModal({ item, onClose }: { item: DodItem | null; onClose: () => void }) {
  return (
    <Modal open={!!item} onClose={onClose} title={item?.code ?? ''} size="sm">
      {item && (
        <div className="flex flex-col gap-3">
          {item.categorie && (
            <span className="text-[11px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full w-fit uppercase tracking-wide">
              {item.categorie}
            </span>
          )}
          <h3 className="text-sm font-semibold text-navy">{item.titre}</h3>
          {item.description && <p className="text-xs text-subtle whitespace-pre-wrap">{item.description}</p>}
          {!item.actif && <p className="text-xs text-orange font-medium">Ce critère est désactivé dans le référentiel.</p>}
        </div>
      )}
    </Modal>
  )
}
