// Edge Function: cria um usuário (aluno/professor/admin) no Supabase Auth.
// Só um ADMINISTRADOR autenticado pode chamar. Usa a service role key
// (fica no servidor, NUNCA no frontend).
//
// Deploy:  supabase functions deploy criar-usuario
// Requer os secrets automáticos SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const EMAIL_DOMAIN = 'nota.local'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1) Verifica quem está chamando (token do header) e se é ADMIN
    const authHeader = req.headers.get('Authorization') ?? ''
    const clienteAuth = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await clienteAuth.auth.getUser()
    if (userErr || !userData.user) {
      return json({ error: 'Não autenticado.' }, 401)
    }
    const { data: perfil } = await clienteAuth
      .from('usuarios')
      .select('tipo')
      .eq('id', userData.user.id)
      .single()
    if (perfil?.tipo !== 'ADMINISTRADOR') {
      return json({ error: 'Apenas administradores podem criar usuários.' }, 403)
    }

    // 2) Lê os dados do novo usuário
    const body = await req.json()
    const matricula = String(body.matricula ?? '').trim().toLowerCase()
    const senha = String(body.senha ?? '')
    const tipo = String(body.tipo ?? 'PROFESSOR')
    if (!matricula || senha.length < 6) {
      return json({ error: 'Matrícula obrigatória e senha com ao menos 6 caracteres.' }, 400)
    }
    // Alunos não logam; só criamos professores e administradores.
    if (!['PROFESSOR', 'ADMINISTRADOR'].includes(tipo)) {
      return json({ error: 'Tipo inválido (use PROFESSOR ou ADMINISTRADOR).' }, 400)
    }

    // 3) Cria o usuário com a service role key (o trigger cria o perfil em `usuarios`)
    const admin = createClient(url, serviceKey)
    const { data: novo, error: createErr } = await admin.auth.admin.createUser({
      email: `${matricula}@${EMAIL_DOMAIN}`,
      password: senha,
      email_confirm: true,
      user_metadata: { matricula, tipo },
    })
    if (createErr) {
      return json({ error: createErr.message }, 400)
    }

    // 4) Garante o tipo correto no perfil (o trigger cria como ALUNO por padrão)
    if (novo.user) {
      await admin.from('usuarios').update({ tipo }).eq('id', novo.user.id)
    }

    return json({ ok: true, id: novo.user?.id, matricula })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
