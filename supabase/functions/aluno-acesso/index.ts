// Edge Function: fluxo de acesso do aluno (sem exigir login prévio).
// Ações:
//   - "verificar": recebe { matricula } e diz se existe e se é primeiro acesso.
//   - "definir-senha": recebe { matricula, senha } e define a senha SOMENTE
//      se ainda for primeiro acesso; depois marca primeiro_acesso = false.
//
// Usa a service role key (fica no servidor). É pública (não exige Authorization),
// pois o aluno ainda não está logado — mas só age sobre contas do tipo ALUNO
// e a definição de senha só funciona enquanto primeiro_acesso = true.
//
// Deploy: supabase functions deploy aluno-acesso --no-verify-jwt

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
    const admin = createClient(url, serviceKey)

    const body = await req.json()
    const acao = String(body.acao ?? '')
    const matricula = String(body.matricula ?? '').trim().toLowerCase()
    if (!matricula) return json({ error: 'Informe a matrícula.' }, 400)

    // Busca o usuário (aluno) pela matrícula
    const { data: usuario } = await admin
      .from('usuarios')
      .select('id, tipo, primeiro_acesso')
      .eq('matricula', matricula)
      .maybeSingle()

    if (!usuario || usuario.tipo !== 'ALUNO') {
      return json({ error: 'Matrícula não encontrada.' }, 404)
    }

    if (acao === 'verificar') {
      return json({ existe: true, primeiroAcesso: usuario.primeiro_acesso })
    }

    if (acao === 'definir-senha') {
      const senha = String(body.senha ?? '')
      if (senha.length < 6) return json({ error: 'A senha deve ter ao menos 6 caracteres.' }, 400)
      if (!usuario.primeiro_acesso) {
        return json({ error: 'A senha já foi definida. Faça login normalmente.' }, 409)
      }
      const { error: upErr } = await admin.auth.admin.updateUserById(usuario.id, { password: senha })
      if (upErr) return json({ error: upErr.message }, 400)
      await admin.from('usuarios').update({ primeiro_acesso: false }).eq('id', usuario.id)
      return json({ ok: true, email: `${matricula}@${EMAIL_DOMAIN}` })
    }

    return json({ error: 'Ação inválida.' }, 400)
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
