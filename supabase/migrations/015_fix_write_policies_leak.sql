-- ============================================================
-- Migração 015: corrige vazamento de leitura pelas policies de escrita.
--
-- Problema: as policies de escrita eram FOR ALL. No Postgres, uma
-- policy FOR ALL também vale para SELECT: seu USING é combinado (OR)
-- com as policies de SELECT. Como o USING de escrita em várias tabelas
-- era `is_professor_ou_admin()` (sem escopo), QUALQUER professor via
-- todos os registros — furando o isolamento por turma.
--
-- Solução: trocar as policies de escrita FOR ALL por policies
-- específicas de INSERT/UPDATE/DELETE (que NÃO afetam SELECT), com o
-- escopo correto por turma. As policies de SELECT (já escopadas) passam
-- a ser a única fonte de leitura.
-- Idempotente.
-- ============================================================

-- ---------- matriculas ----------
drop policy if exists matriculas_scope_write on matriculas;
-- Professor/admin podem inserir alunos (o vínculo à turma controla a visibilidade).
create policy matriculas_insert on matriculas
  for insert with check (is_professor_ou_admin());
-- Editar/excluir: admin, ou professor apenas de alunos que estão nas turmas dele.
create policy matriculas_update on matriculas
  for update using (
    is_admin() or id in (select minhas_matriculas_ids())
  ) with check (
    is_admin() or id in (select minhas_matriculas_ids())
  );
create policy matriculas_delete on matriculas
  for delete using (
    is_admin() or id in (select minhas_matriculas_ids())
  );

-- ---------- matriculas_turmas ----------
drop policy if exists mt_scope_write on matriculas_turmas;
create policy mt_insert on matriculas_turmas
  for insert with check (
    is_admin() or turma_id in (select minhas_turmas())
  );
create policy mt_delete on matriculas_turmas
  for delete using (
    is_admin() or turma_id in (select minhas_turmas())
  );
create policy mt_update on matriculas_turmas
  for update using (
    is_admin() or turma_id in (select minhas_turmas())
  ) with check (
    is_admin() or turma_id in (select minhas_turmas())
  );

-- ---------- disciplinas ----------
drop policy if exists disciplinas_scope_write on disciplinas;
create policy disciplinas_insert on disciplinas
  for insert with check (
    is_admin() or turma_id in (select minhas_turmas())
  );
create policy disciplinas_update on disciplinas
  for update using (
    is_admin() or turma_id in (select minhas_turmas())
  ) with check (
    is_admin() or turma_id in (select minhas_turmas())
  );
create policy disciplinas_delete on disciplinas
  for delete using (
    is_admin() or turma_id in (select minhas_turmas())
  );

-- ---------- avaliacoes ----------
drop policy if exists avaliacoes_scope_write on avaliacoes;
create policy avaliacoes_insert on avaliacoes
  for insert with check (
    is_admin() or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
  );
create policy avaliacoes_update on avaliacoes
  for update using (
    is_admin() or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
  ) with check (
    is_admin() or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
  );
create policy avaliacoes_delete on avaliacoes
  for delete using (
    is_admin() or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
  );

-- ---------- notas ----------
drop policy if exists notas_scope_write on notas;
create policy notas_insert on notas
  for insert with check (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  );
create policy notas_update on notas
  for update using (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  ) with check (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  );
create policy notas_delete on notas
  for delete using (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  );

-- ---------- frequencias ----------
drop policy if exists frequencias_scope_write on frequencias;
create policy frequencias_insert on frequencias
  for insert with check (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  );
create policy frequencias_update on frequencias
  for update using (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  ) with check (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  );
create policy frequencias_delete on frequencias
  for delete using (
    is_admin() or matricula_turma_id in (select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas()))
  );
