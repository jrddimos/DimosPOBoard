import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Mot de passe temporaire lisible (pas de 0/O/1/l/I ambigus) — communiqué
// hors bande par l'admin, à changer obligatoirement à la première connexion
// (user_profiles.must_change_password, cf. action create_with_password).
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Client admin (service_role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérifie que l'appelant est authentifié ET admin avant toute action
    // privilégiée (sans ce contrôle, n'importe quel JWT valide pouvait
    // inviter/lister tous les utilisateurs via cette fonction).
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentification requise' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token)
    if (callerErr || !callerData.user) {
      return new Response(JSON.stringify({ error: 'Authentification invalide' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role_global')
      .eq('user_id', callerData.user.id)
      .single()

    if (callerProfile?.role_global !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès réservé aux administrateurs' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { email, display_name, action, user_id, banned } = body

    // Suppression réelle du compte (Setup > Équipes & Utilisateurs) —
    // auth.users cascade sur user_profiles / user_produit_roles (FK ON
    // DELETE CASCADE), pas besoin de nettoyer ces tables séparément. Ne
    // requiert pas d'email : placé avant le garde-fou plus bas.
    if (action === 'delete_user') {
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id requis' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      // RGPD — le trigramme est stocké en texte libre (sans FK) sur
      // plusieurs tables (taches.assigne_a, reunions.animateur/
      // participants, absences…) : il faut le lire et nettoyer ces traces
      // AVANT de supprimer l'utilisateur, sinon le cascade sur
      // user_profiles fait perdre le mapping trigramme↔identité et ces
      // traces restent orphelines pour toujours (cf. migration 0068).
      const { data: profileToDelete } = await supabaseAdmin
        .from('user_profiles')
        .select('trigramme')
        .eq('user_id', user_id)
        .single()
      if (profileToDelete?.trigramme) {
        const { error: anonErr } = await supabaseAdmin.rpc('anonymize_user_traces', { p_trigramme: profileToDelete.trigramme })
        if (anonErr) {
          return new Response(JSON.stringify({ error: anonErr.message }), {
            status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
      }
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Désactivation temporaire (bloque la connexion sans supprimer le
    // compte) / réactivation — via le ban Admin API. Pas d'email requis.
    if (action === 'set_banned') {
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id requis' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: banned ? '876000h' : 'none',
      })
      if (banErr) {
        return new Response(JSON.stringify({ error: banErr.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email requis' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Correction de l'email d'un utilisateur existant (Setup → Équipes &
    // Utilisateurs) : passe par l'Admin API pour appliquer le changement
    // immédiatement (pas le flow de double confirmation du self-service).
    if (action === 'update_email') {
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id requis' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email, email_confirm: true,
      })
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ user: { id: user_id, email } }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Création directe avec mot de passe temporaire, sans email d'invitation
    // — contourne la rate-limit du service email par défaut de Supabase
    // (quelques emails/heure sans SMTP personnalisé). Le mot de passe est
    // renvoyé une seule fois dans la réponse : à communiquer hors bande par
    // l'admin. must_change_password force l'écran de définition du mot de
    // passe à la première connexion (App.tsx, SetPasswordPage.tsx).
    if (action === 'create_with_password') {
      const tempPassword = generateTempPassword()
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { display_name: display_name || email },
      })
      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const newUserId = created.user?.id
      if (!newUserId) {
        return new Response(JSON.stringify({ error: 'Création utilisateur échouée' }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      await supabaseAdmin.from('user_profiles').upsert(
        { user_id: newUserId, display_name: display_name || email, must_change_password: true },
        { onConflict: 'user_id' }
      )
      return new Response(JSON.stringify({ user: { id: newUserId, email }, password: tempPassword }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    let userId: string | null = null

    // Sans redirectTo explicite, GoTrue retombe sur la Site URL configurée
    // dans le dashboard Supabase (souvent obsolète/mal réglée) et le lien
    // d'invitation atterrit sur /login au lieu de l'écran de définition du
    // mot de passe. On force l'origine de l'appel (= le domaine de l'app
    // depuis lequel l'admin invite), comme le fait déjà resetPasswordForEmail
    // côté client (LoginPage.tsx, EquipesUtilisateursPage.tsx).
    // Slash final obligatoire : la liste blanche Redirect URLs du dashboard
    // contient l'entrée exacte "https://domaine/" (avec slash) — sans lui,
    // `new URL(origin).origin` (jamais de slash final) ne matche ni cette
    // entrée exacte ni le pattern "https://domaine/**", et GoTrue rejette
    // l'invitation entière avec un 400 au lieu de retomber sur la Site URL.
    const origin = req.headers.get('origin') ?? req.headers.get('referer')
    const redirectTo = origin ? `${new URL(origin).origin}/` : undefined

    let { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: display_name || email },
      redirectTo,
    })

    // Filet de sécurité : si le domaine n'est (pas encore) whitelisté côté
    // dashboard, GoTrue rejette l'invitation entière plutôt que de retomber
    // sur la Site URL — on retente sans redirectTo pour ne jamais bloquer
    // l'invitation elle-même (le lien atterrira alors sur /login, à corriger
    // en whitelistant le domaine plutôt qu'en subissant un 400).
    if (error && redirectTo && /redirect/i.test(error.message ?? '')) {
      ({ data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: display_name || email },
      }))
    }

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
