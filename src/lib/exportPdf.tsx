import { Document, Page, View, Text, StyleSheet, pdf } from '@react-pdf/renderer'
import type { Sprint, Tache } from '@/types'

const styles = StyleSheet.create({
  page:     { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1E3A5F' },
  title:    { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#6B6B8A', marginBottom: 16, borderBottom: '2 solid #1E3A5F', paddingBottom: 12 },
  kpiRow:   { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kpi:      { flex: 1, backgroundColor: '#F4F5F9', borderRadius: 6, padding: 10, alignItems: 'center' },
  kpiVal:   { fontSize: 18, fontWeight: 700 },
  kpiLbl:   { fontSize: 8, color: '#6B6B8A', marginTop: 2 },
  h2:       { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#6B6B8A', marginTop: 16, marginBottom: 8 },
  box:      { backgroundColor: '#F4F5F9', borderRadius: 6, padding: 10, marginBottom: 4, fontSize: 9, lineHeight: 1.5 },
  table:    { borderRadius: 6, border: '1 solid #E2E2F0', overflow: 'hidden' },
  tr:       { flexDirection: 'row', borderBottom: '1 solid #E2E2F0' },
  th:       { backgroundColor: '#1E3A5F', color: '#fff', fontSize: 8, fontWeight: 700, padding: 5 },
  td:       { fontSize: 8, padding: 5, color: '#1E3A5F' },
  cId:      { width: '12%', color: '#4A4CC8', fontWeight: 700 },
  cTitre:   { width: '38%' },
  cEpic:    { width: '18%' },
  cEffort:  { width: '10%', textAlign: 'center' },
  cAssigne: { width: '12%', textAlign: 'center' },
  cStatut:  { width: '10%', textAlign: 'center' },
  footer:   { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 8, color: '#6B6B8A', textAlign: 'center' },
})

function TaskTable({ tasks }: { tasks: Tache[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tr}>
        <Text style={[styles.th, styles.cId]}>ID</Text>
        <Text style={[styles.th, styles.cTitre]}>Titre</Text>
        <Text style={[styles.th, styles.cEpic]}>Epic</Text>
        <Text style={[styles.th, styles.cEffort]}>Effort</Text>
        <Text style={[styles.th, styles.cAssigne]}>Assigné</Text>
        <Text style={[styles.th, styles.cStatut]}>Statut</Text>
      </View>
      {tasks.map(t => (
        <View style={styles.tr} key={t.id_tache} wrap={false}>
          <Text style={[styles.td, styles.cId]}>{t.id_tache}</Text>
          <Text style={[styles.td, styles.cTitre]}>{t.titre}</Text>
          <Text style={[styles.td, styles.cEpic]}>{t.epic?.split(' — ')[1] ?? t.epic ?? '—'}</Text>
          <Text style={[styles.td, styles.cEffort]}>{t.effort_j ?? 0}j</Text>
          <Text style={[styles.td, styles.cAssigne]}>{t.assigne_a ?? '—'}</Text>
          <Text style={[styles.td, styles.cStatut]}>{t.statut}</Text>
        </View>
      ))}
    </View>
  )
}

function SprintReviewDoc({ sprint, taches }: { sprint: Sprint; taches: Tache[] }) {
  const parents = taches.filter(t => !t.parent_id && t.type_tache !== 'Conteneur')
  const fait    = parents.filter(t => t.statut === 'Fait')
  const nonFait = parents.filter(t => t.statut !== 'Fait')
  const effort  = parents.reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const pct     = parents.length ? Math.round(fait.length / parents.length * 100) : 0
  const date    = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <Document title={`Sprint Review — ${sprint.numero}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Sprint Review — {sprint.numero}</Text>
        <Text style={styles.subtitle}>Généré le {date} · Dimos D3X+ PO Board</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpi}><Text style={styles.kpiVal}>{parents.length}</Text><Text style={styles.kpiLbl}>US planifiées</Text></View>
          <View style={styles.kpi}><Text style={[styles.kpiVal, { color: '#065F46' }]}>{fait.length}</Text><Text style={styles.kpiLbl}>Terminées</Text></View>
          <View style={styles.kpi}><Text style={[styles.kpiVal, { color: '#4A4CC8' }]}>{pct}%</Text><Text style={styles.kpiLbl}>Avancement</Text></View>
          <View style={styles.kpi}><Text style={[styles.kpiVal, { color: '#0055CC' }]}>{effort}j</Text><Text style={styles.kpiLbl}>Effort total</Text></View>
        </View>

        {sprint.objectifs && <><Text style={styles.h2}>Objectifs</Text><Text style={styles.box}>{sprint.objectifs}</Text></>}
        {sprint.review    && <><Text style={styles.h2}>Bilan</Text><Text style={styles.box}>{sprint.review}</Text></>}

        {fait.length > 0 && <><Text style={styles.h2}>Réalisé ({fait.length} US)</Text><TaskTable tasks={fait} /></>}
        {nonFait.length > 0 && <><Text style={[styles.h2, { marginTop: 14 }]}>Non réalisé ({nonFait.length} US)</Text><TaskTable tasks={nonFait} /></>}

        <Text style={styles.footer} fixed>Dimos D3X+ · By Roofers For Roofers · {sprint.numero}</Text>
      </Page>
    </Document>
  )
}

export async function exportSprintReviewPDF(sprint: Sprint, taches: Tache[]): Promise<void> {
  const blob = await pdf(<SprintReviewDoc sprint={sprint} taches={taches} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `SprintReview_${sprint.numero}_${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
