import { confirm } from '@/components/ui/ConfirmModal'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useActivityLog, useClearActivityLog } from '@/hooks/useActivityLog'
import { useProduit } from '@/contexts/ProduitContext'
import { useAuth } from '@/contexts/AuthContext'
import { Trash2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTION_STYLE = {
  create: { bg: 'bg-emerald-50',  text: 'text-emerald-600', label: 'Créé'     },
  update: { bg: 'bg-indigo-50',   text: 'text-indigo-600',  label: 'Modifié'  },
  delete: { bg: 'bg-rose-50',     text: 'text-rose-600',    label: 'Supprimé' },
  status: { bg: 'bg-amber-50',    text: 'text-amber-600',   label: 'Statut'   },
}

export default function ActivitePage() {
  const { produitActif } = useProduit()
  const { isAdmin } = useAuth()
  const { data: logs = [], isLoading } = useActivityLog(produitActif?.id ?? null)
  const clearLog = useClearActivityLog()

  // Grouper par jour
  const grouped: Record<string, typeof logs> = {}
  logs.forEach(log => {
    const day = log.created_at.slice(0, 10)
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(log)
  })

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-navy"/>
          <h1 className="text-sm font-semibold text-navy">Activité</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-subtle">{logs.length} événement{logs.length > 1 ? 's' : ''}</span>
          {logs.length > 0 && isAdmin && produitActif && (
            <button onClick={() => { confirm({title:"Effacer l'historique ?",message:"Tous les événements enregistrés pour ce produit seront supprimés, pour toute l'équipe.",confirmLabel:'Effacer',variant:'danger'}).then(ok=>{ if(ok) clearLog.mutate(produitActif.id) }) }}
              className="ds-btn ds-btn-sm text-rose-500 hover:bg-rose-50 flex items-center gap-1">
              <Trash2 size={11}/>Effacer
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : !logs.length ? (
        <div className="ds-card flex flex-col items-center py-20 text-subtle gap-3">
          <Clock size={48} className="opacity-20"/>
          <p className="text-sm font-medium">Aucune activité</p>
          <p className="text-xs">Les modifications de l'équipe sur ce produit apparaîtront ici</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([day, dayLogs]) => (
            <div key={day}>
              <div className="ds-section-divider">
                <span>{new Date(day).toLocaleDateString('fr-FR', {weekday:'long',day:'2-digit',month:'long'})}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {dayLogs.map(log => {
                  const style = ACTION_STYLE[log.action]
                  return (
                    <div key={log.id} className="ds-card flex items-start gap-3 py-2.5">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5', style.bg, style.text)}>
                        {style.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-indigo-600">{log.target}</span>
                          <span className="text-xs text-navy truncate">{log.title}</span>
                        </div>
                        {log.field && (
                          <div className="text-xs text-subtle mt-0.5">
                            {log.field}
                            {log.old_value && <span className="line-through mx-1 text-rose-400">{log.old_value}</span>}
                            {log.new_value && <span className="text-emerald-600 font-medium">{log.new_value}</span>}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-subtle shrink-0">
                        {new Date(log.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
