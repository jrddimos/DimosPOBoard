import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

// Session stockée en sessionStorage (pas localStorage, le défaut Supabase) :
// elle survit à un rafraîchissement de page (même onglet), mais disparaît à
// la fermeture de l'onglet/navigateur — reconnexion obligatoire ensuite,
// au lieu de rester connecté indéfiniment.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: window.sessionStorage },
})
