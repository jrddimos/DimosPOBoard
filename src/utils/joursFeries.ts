export interface JourFerie {
  iso:   string  // YYYY-MM-DD
  label: string
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(d.getDate() + n); return r
}

// Algorithme de Oudin — calcule le dimanche de Pâques
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

export function getJoursFeries(year: number): JourFerie[] {
  const fixed: [number, number, string][] = [
    [1,  1,  "Jour de l'an"],
    [5,  1,  "Fête du Travail"],
    [5,  8,  "Victoire 1945"],
    [7,  14, "Fête Nationale"],
    [8,  15, "Assomption"],
    [11, 1,  "Toussaint"],
    [11, 11, "Armistice"],
    [12, 25, "Noël"],
  ]

  const easter = easterSunday(year)

  const days: JourFerie[] = [
    ...fixed.map(([m, d, label]) => ({ iso: toISO(new Date(year, m-1, d)), label })),
    { iso: toISO(addDays(easter,  1)), label: "Lundi de Pâques"      },
    { iso: toISO(addDays(easter, 39)), label: "Jeudi de l'Ascension" },
    { iso: toISO(addDays(easter, 50)), label: "Lundi de Pentecôte"   },
  ]

  return days.sort((a, b) => a.iso.localeCompare(b.iso))
}

// Retourne le nombre de jours ouvrés dans une semaine (lundi donné),
// en soustrayant les jours fériés et les fermetures société
export function joursOuvresSemaine(
  lundi: Date,
  feriesSet: Set<string>,
  fermeturesRanges: { debut: string; fin: string }[]
): number {
  let count = 0
  for (let d = 0; d < 5; d++) {
    const day = new Date(lundi)
    day.setDate(lundi.getDate() + d)
    const iso = toISO(day)
    if (feriesSet.has(iso)) continue
    if (fermeturesRanges.some(f => iso >= f.debut && iso <= f.fin)) continue
    count++
  }
  return count
}

// Retourne les labels des jours non-ouvrés d'une semaine
export function labelsFermes(
  lundi: Date,
  feriesMap: Map<string, string>,
  fermeturesMap: Map<string, string>
): string[] {
  const labels: string[] = []
  for (let d = 0; d < 5; d++) {
    const day = new Date(lundi)
    day.setDate(lundi.getDate() + d)
    const iso = toISO(day)
    const ferie = feriesMap.get(iso)
    if (ferie) labels.push(ferie)
    const fermeture = fermeturesMap.get(iso)
    if (fermeture && !labels.includes(fermeture)) labels.push(fermeture)
  }
  return labels
}

export function toISO_date(d: Date): string { return toISO(d) }
