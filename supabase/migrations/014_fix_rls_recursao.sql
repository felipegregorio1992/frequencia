-- ============================================================
-- Migração 014: corrige recursão infinita entre policies.
--
-- Problema: turmas_scope_select consultava matriculas_turmas, e
-- mt_scope_select consultava turmas/minhas_turmas() de volta ->
-- "infinite recursion detected in policy".
--
-- Solução: usar funções SECURITY DEFINER (que executam SEM aplicar
-- RLS internamente) para os checks cruzados, quebrando o ciclo.
--  * minhas_turmas()            -> turmas do professor (já existe, é SD)
--  * turmas_do_aluno()          -> turma_ids onde o aluno logado está
--  * minhas_matriculas_turmas() -> mt.id do aluno logado (já existe, é SD)
-- Como as policies passam a chamar só funções SD (não subselects diretos
-- nas tabelas com RLS), não há recursão.
-- Idempotente.
-- ============================================================

-- Turmas em que o ALUNO logado está matriculado (sem RLS interno).
create or replace function turmas_do_aluno()
returns setof bigint
language sql
security definer
stable
as $$
  select mt.turma_id
  from matriculas_turmas mt
  join matriculas m on m.id = mt.matricula_id
  where m.usuario_id = auth.uid();
$$;
grant execute on function turmas_do_aluno() to authenticated;

-- Matriculas (ids) que o professor logado enxerga (alunos nas suas turmas).
create or replace function minhas_matriculas_ids()
returns setof bigint
language sql
security definer
stable
as $$
  select mt.matricula_id
  from matriculas_turmas mt
  where mt.turma_id in (select minhas_turmas());
$$;
grant execute on function minhas_matriculas_ids() to authenticated;

-- ---------- turmas ----------
drop policy if exists turmas_scope_select on turmas;
create policy turmas_scope_select on turmas
  for select using (
    is_admin()
    or id in (select minhas_turmas())
    or id in (select turmas_do_aluno())
  );

-- ---------- matriculas_turmas ----------
drop policy if exists mt_scope_select on matriculas_turmas;
create policy mt_scope_select on matriculas_turmas
  for select using (
    is_admin()
    or turma_id in (select minhas_turmas())
    or turma_id in (select turmas_do_aluno())
  );

-- ---------- matriculas ----------
drop policy if exists matriculas_scope_select on matriculas;
create policy matriculas_scope_select on matriculas
  for select using (
    is_admin()
    or usuario_id = auth.uid()
    or id in (select minhas_matriculas_ids())
  );
