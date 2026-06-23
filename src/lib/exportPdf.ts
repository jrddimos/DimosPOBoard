import type { Sprint, Tache } from '@/types'

export function exportSprintReviewHTML(sprint: Sprint, taches: Tache[]): void {
  const parents  = taches.filter(t => !t.parent_id)
  const fait     = parents.filter(t => t.statut === 'Fait')
  const nonFait  = parents.filter(t => t.statut !== 'Fait')
  const effort   = parents.reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const pct      = parents.length ? Math.round(fait.length / parents.length * 100) : 0
  const date     = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const tableRows = (tasks: Tache[]) => tasks.map(t => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E2F0;font-weight:600;color:#4A4CC8;white-space:nowrap">${t.id_tache}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E2F0">${t.titre}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E2F0;white-space:nowrap">${t.epic?.split(' — ')[1] ?? t.epic ?? '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E2F0;text-align:center">${t.effort_j ?? 0}j</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E2F0;text-align:center">${t.assigne_a ?? '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E2F0;text-align:center;color:${t.statut==='Fait'?'#065F46':'#92600A'}">${t.statut}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Sprint Review — ${sprint.numero}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1E3A5F; margin: 0; padding: 32px; }
  h1   { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  h2   { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #6B6B8A; margin: 24px 0 12px; }
  .header { border-bottom: 3px solid #1E3A5F; padding-bottom: 16px; margin-bottom: 24px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi  { background: #F4F5F9; border-radius: 10px; padding: 14px; text-align: center; }
  .kpi .val { font-size: 28px; font-weight: 700; }
  .kpi .lbl { font-size: 11px; color: #6B6B8A; margin-top: 2px; }
  .section { background: #FFF; border: 1px solid #E2E2F0; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1E3A5F; color: #fff; text-align: left; padding: 8px 10px; font-size: 11px; }
  .objectives { background: #F4F5F9; border-radius: 10px; padding: 16px; margin-bottom: 20px; white-space: pre-line; font-size: 13px; line-height: 1.7; }
  .review-text { background: #EDE9FE; border-radius: 10px; padding: 16px; margin-bottom: 20px; white-space: pre-line; font-size: 13px; line-height: 1.7; }
  .footer { margin-top: 32px; font-size: 11px; color: #6B6B8A; text-align: center; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Sprint Review — ${sprint.numero}</h1>
    <div style="font-size:13px;color:#6B6B8A">Généré le ${date} · Dimos D3X+ PO Board</div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="val">${parents.length}</div><div class="lbl">US planifiées</div></div>
    <div class="kpi"><div class="val" style="color:#065F46">${fait.length}</div><div class="lbl">Terminées</div></div>
    <div class="kpi"><div class="val" style="color:#4A4CC8">${pct}%</div><div class="lbl">Avancement</div></div>
    <div class="kpi"><div class="val" style="color:#0055CC">${effort}j</div><div class="lbl">Effort total</div></div>
  </div>

  ${sprint.objectifs ? `<h2>Objectifs</h2><div class="objectives">${sprint.objectifs}</div>` : ''}
  ${sprint.review    ? `<h2>Bilan</h2><div class="review-text">${sprint.review}</div>` : ''}

  ${fait.length > 0 ? `
  <h2>✅ Réalisé (${fait.length} US)</h2>
  <div class="section">
    <table>
      <thead><tr><th>ID</th><th>Titre</th><th>Epic</th><th>Effort</th><th>Assigné</th><th>Statut</th></tr></thead>
      <tbody>${tableRows(fait)}</tbody>
    </table>
  </div>` : ''}

  ${nonFait.length > 0 ? `
  <h2>⚠️ Non réalisé (${nonFait.length} US)</h2>
  <div class="section">
    <table>
      <thead><tr><th>ID</th><th>Titre</th><th>Epic</th><th>Effort</th><th>Assigné</th><th>Statut</th></tr></thead>
      <tbody>${tableRows(nonFait)}</tbody>
    </table>
  </div>` : ''}

  <div class="footer">Dimos D3X+ · By Roofers For Roofers · ${sprint.numero}</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `SprintReview_${sprint.numero}_${new Date().toISOString().slice(0,10)}.html`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
