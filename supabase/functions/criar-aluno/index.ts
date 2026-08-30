// Edge Function: cria a matrícula do aluno JUNTO com sua conta de login.
// Só ADMINISTRADOR pode chamar. Cria a conta de auth com senha temporária
// aleatória e primeiro_acesso = true (o aluno define a senha no 1º acesso).
//
// Body: { codigo, nome_aluno }  (a matrícula/login é o próprio `codigo`)
// Deploy: supabase functions deploy criar-aluno

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

    // valida que o chamador é ADMIN
    const authHeader = req.headers.get('Authorization') ?? ''
    const clienteAuth = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await clienteAuth.auth.getUser()
    if (!userData.user) return json({ error: 'Não autenticado.' }, 401)
    const { data: perfil } = await clienteAuth.from('usuarios').select('tipo').eq('id', userData.user.id).single()
    if (perfil?.tipo !== 'ADMINISTRADOR') return json({ error: 'Apenas administradores.' }, 403)

    const body = await req.json()
    const codigo = String(body.codigo ?? '').trim()
    const matriculaLogin = codigo.toLowerCase()
    const nome = String(body.nome_aluno ?? '').trim()
    if (!codigo || !nome) return json({ error: 'Código e nome do aluno são obrigatórios.' }, 400)

    const admin = createClient(url, serviceKey)

    // senha temporária aleatória (o aluno nunca a usa; define a dele no 1º acesso)
    const senhaTemp = crypto.randomUUID()
    const { data: novo, error: createErr } = await admin.auth.admin.createUser({
      email: `${matriculaLogin}@${EMAIL_DOMAIN}`,
      password: senhaTemp,
      email_confirm: true,
      user_metadata: { matricula: matriculaLogin, tipo: 'ALUNO' },
    })
    if (createErr) return json({ error: createErr.message }, 400)
    const uid = novo.user!.id

    // garante perfil ALUNO + primeiro acesso
    await admin.from('usuarios').update({ tipo: 'ALUNO', primeiro_acesso: true }).eq('id', uid)

    // cria a matrícula ligada ao usuário
    const { error: matErr } = await admin
      .from('matriculas')
      .insert({ codigo, nome_aluno: nome, ativo: true, usuario_id: uid })
    if (matErr) {
      // rollback da conta se a matrícula falhar
      await admin.auth.admin.deleteUser(uid)
      return json({ error: matErr.message }, 400)
    }

    return json({ ok: true, usuario_id: uid })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
