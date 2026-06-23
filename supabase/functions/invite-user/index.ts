import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { email, display_name } = await req.json()

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email requis' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Client admin (service_role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let userId: string | null = null

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: display_name || email },
    })

    if (error) {
      // Si l'utilisateur existe déjà, on récupère son ID pour mettre à jour ses rôles
      if (error.message?.toLowerCase().includes('already') || error.message?.toLowerCase().includes('exists')) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers()
        const existing = list?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase())
        if (existing) {
          userId = existing.id
        } else {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
      } else {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    } else {
      userId = data.user?.id ?? null
    }

    if (userId) {
      await supabaseAdmin.from('user_profiles').upsert(
        { user_id: userId, display_name: display_name || email },
        { onConflict: 'user_id' }
      )
    }

    return new Response(JSON.stringify({ user: { id: userId, email } }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
