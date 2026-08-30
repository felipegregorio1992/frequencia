-- ============================================================
-- Migração 005: acesso do aluno SEM Edge Function
-- Verificação de matrícula via RPC (security definer), e senha
-- inicial = a própria matrícula (aluno troca no primeiro acesso).
-- ============================================================

-- RPC pública: informa se a matrícula existe (aluno) e se é primeiro acesso.
create or replace function verificar_matricula_aluno(p_matricula text)
returns table(existe boolean, primeiro_acesso boolean)
language sql
security definer
stable
as $$
  select true, u.primeiro_acesso
  from usuarios u
  where lower(u.matricula) = lower(p_matricula) and u.tipo = 'ALUNO'
  limit 1;
$$;

-- Permite chamar a função sem login (papel anon) e autenticado.
grant execute on function verificar_matricula_aluno(text) to anon, authenticated;
