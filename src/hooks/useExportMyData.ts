import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { downloadJSON, parseAssignees } from '@/lib/utils'

// RGPD — droit à la portabilité : rassemble toutes les données personnelles
// de l'utilisateur connecté (tables avec FK user_id/created_by + tables
// trigramme-texte sans FK, cf. plan d'anonymisation 0068) dans un seul
// export JSON téléchargeable. Pas de mutation React Query ici : un simple
// effet ponctuel déclenché par un clic, pas une donnée mise en cache.
export function useExportMyData() {
  const [isPending, setIsPending] = useState(false)

  async function exportMyData(userId: string, trigramme: string | null) {
    setIsPending(true)
    try {
      const byUserId = (table: string, col = 'user_id') =>
        supabase.from(table).select('*').eq(col, userId).then(r => r.data ?? [])

      const [
        profile, quickNotes, suggestions, notifications, dashboardViews,
        activite, commentaires, messages, attachments, temps, scorecard,
        absencesCreated, reunionsCreated,
      ] = await Promise.all([
        byUserId('user_profiles'),
        byUserId('quick_notes'),
        byUserId('suggestions', 'auteur_id'),
        byUserId('notifications'),
        byUserId('user_dashboard_views'),
        byUserId('activite'),
        byUserId('tache_commentaires'),
        byUserId('produit_messages'),
        byUserId('tache_attachments', 'uploaded_by'),
        byUserId('tache_temps'),
        byUserId('scorecard_initiatives', 'created_by'),
        byUserId('absences', 'created_by'),
        byUserId('reunions', 'created_by'),
      ])

      // Tables trigramme-texte (pas de FK, cf. migration 0068) : sans
      // trigramme connu, rien à en tirer.
      let tachesAssignees: unknown[] = []
      let planCharges: unknown[] = []
      let iterations: unknown[] = []
      let reunionsAnimateur: unknown[] = []
      let reunionsParticipant: unknown[] = []
      let absencesTrigramme: unknown[] = []

      if (trigramme) {
        const [tachesCandidates, pc, iters, animateur, participant, absTrg] = await Promise.all([
          supabase.from('taches').select('*').ilike('assigne_a', `%${trigramme}%`).then(r => r.data ?? []),
          supabase.from('plan_charges').select('*').eq('assigne_a', trigramme).then(r => r.data ?? []),
          supabase.from('tache_iterations').select('*').eq('assigne_a', trigramme).then(r => r.data ?? []),
          supabase.from('reunions').select('*').eq('animateur', trigramme).then(r => r.data ?? []),
          supabase.from('reunions').select('*').contains('participants', [trigramme]).then(r => r.data ?? []),
          supabase.from('absences').select('*').eq('trigramme', trigramme).then(r => r.data ?? []),
        ])
        // Pré-filtre SQL large (ilike) puis match exact par jeton — évite
        // qu'un trigramme substring d'un autre (ex. "JR" dans "JRA") ne
        // remonte à tort dans l'export.
        tachesAssignees = tachesCandidates.filter((t: { assigne_a?: string | null }) => parseAssignees(t.assigne_a).includes(trigramme))
        planCharges = pc
        iterations = iters
        reunionsAnimateur = animateur
        reunionsParticipant = participant
        absencesTrigramme = absTrg
      }

      downloadJSON({
        exported_at: new Date().toISOString(),
        profile,
        quick_notes: quickNotes,
        suggestions,
        notifications,
        user_dashboard_views: dashboardViews,
        activite,
        tache_commentaires: commentaires,
        produit_messages: messages,
        tache_attachments: attachments,
        tache_temps: temps,
        scorecard_initiatives: scorecard,
        absences_creees: absencesCreated,
        absences_me_concernant: absencesTrigramme,
        reunions_creees: reunionsCreated,
        reunions_animees: reunionsAnimateur,
        reunions_participant: reunionsParticipant,
        taches_assignees: tachesAssignees,
        plan_charges: planCharges,
        tache_iterations: iterations,
      }, 'mes_donnees')
    } finally {
      setIsPending(false)
    }
  }

  return { exportMyData, isPending }
}
