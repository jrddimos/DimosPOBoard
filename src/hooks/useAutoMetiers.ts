import { useState } from 'react'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { METIERS_DEFAULT } from '@/constants'
import type { Tache } from '@/types'

export function useAutoMetiers() {
  const [isPending, setIsPending] = useState(false)
  const [progress, setProgress] = useState<{done:number;total:number}|null>(null)

  async function run(taches: Tache[], onlyEmpty = true): Promise<{updated:number;errors:string[]}> {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY manquante dans .env')

    const toClassify = onlyEmpty
      ? taches.filter(t => !t.parent_id && !t.metier && (t.description || t.titre))
      : taches.filter(t => !t.parent_id && (t.description || t.titre))

    if (!toClassify.length) return { updated: 0, errors: [] }

    setIsPending(true)
    setProgress({ done: 0, total: toClassify.length })

    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

      // Envoi en batch de 50 max pour rester dans les limites de tokens
      const BATCH = 50
      let updated = 0
      const errors: string[] = []

      for (let i = 0; i < toClassify.length; i += BATCH) {
        const chunk = toClassify.slice(i, i + BATCH)

        const usLines = chunk.map(t =>
          `${t.id_tache}: ${t.titre}${t.description ? ` | ${t.description.slice(0, 200)}` : ''}`
        ).join('\n')

        const prompt = `Tu es expert en gestion de produit. Classe chaque User Story dans exactement UN des métiers suivants :
${METIERS_DEFAULT.map(m => `- ${m}`).join('\n')}

Réponds UNIQUEMENT en JSON valide, sans texte avant ni après, format :
{"US-001":"Conception R&D","US-002":"Mkt & Commerce",...}

User Stories à classifier :
${usLines}`

        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        })

        const raw = (msg.content[0] as {type:string;text:string}).text.trim()
        let map: Record<string,string> = {}
        try {
          // Extraire le JSON même si Claude ajoute du texte autour
          const jsonMatch = raw.match(/\{[\s\S]*\}/)
          if (jsonMatch) map = JSON.parse(jsonMatch[0])
        } catch {
          errors.push(`Batch ${i/BATCH+1}: réponse non parseable`)
          continue
        }

        for (const t of chunk) {
          const metier = map[t.id_tache]
          if (!metier || !METIERS_DEFAULT.includes(metier)) {
            errors.push(`${t.id_tache}: métier inconnu "${metier}"`)
            continue
          }
          const { error } = await supabase.from('taches').update({ metier }).eq('id', t.id)
          if (error) errors.push(`${t.id_tache}: ${error.message}`)
          else updated++
        }

        setProgress({ done: Math.min(i + BATCH, toClassify.length), total: toClassify.length })
      }

      return { updated, errors }
    } finally {
      setIsPending(false)
      setProgress(null)
    }
  }

  return { run, isPending, progress }
}
