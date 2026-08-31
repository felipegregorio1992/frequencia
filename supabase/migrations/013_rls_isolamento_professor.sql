-- ============================================================
-- Migração 013: isolamento por professor (RLS)
--
-- Regra geral:
--  * ADMINISTRADOR vê e gerencia tudo.
--  * PROFESSOR só vê/gerencia dados das turmas às quais está
--    vinculado (professores_turmas), via minhas_turmas().
--  * ALUNO só vê os próprios dados (via matriculas.usuario_id).
--
-- Cadeia de escopo:
--  turmas            -> id in minhas_turmas()
--  disciplinas       -> turma_id in minhas_turmas()
--  matriculas_turmas -> turma_id in minhas_turmas()
--  matriculas        -> existe matriculas_turmas em minhas_turmas() (ou é o próprio aluno)
--  avaliacoes        -> disciplina.turma_id in minhas_turmas()
--  notas/frequencias -> matriculas_turmas.turma_id in minhas_turmas()
--
-- Idempotente.
-- ============================================================

-- ---------- professores_turmas: só admin gerencia; professor vê os próprios ----------
alter table professores_turmas enable row level security;

drop policy if exists pt_admin_all on professores_turmas;
create policy pt_admin_all on professores_turmas
  for all using (is_admin()) with check (is_admin());

drop policy if exists pt_self_select on professores_turmas;
create policy pt_self_select on professores_turmas
  for select using (professor_id = auth.uid() or is_admin());

-- ---------- turmas ----------
drop policy if exists turmas_select on turmas;
drop policy if exists turmas_prof_write on turmas;
drop policy if exists turmas_admin_write on turmas;

-- SELECT: admin tudo; professor as suas; aluno as turmas em que está matriculado.
create policy turmas_scope_select on turmas
  for select using (
    is_admin()
    or id in (select minhas_turmas())
    or id in (
      select mt.turma_id from matriculas_turmas mt
      join matriculas m on m.id = mt.matricula_id
      where m.usuario_id = auth.uid()
    )
  );
-- Escrita de turma: somente admin (admin cria a turma e vincula professores).
create policy turmas_admin_write on turmas
  for all using (is_admin()) with check (is_admin());

-- ---------- disciplinas (matérias) ----------
drop policy if exists disciplinas_select on disciplinas;
drop policy if exists disciplinas_prof_write on disciplinas;
drop policy if exists disciplinas_admin_write on disciplinas;

create policy disciplinas_scope_select on disciplinas
  for select using (
    is_admin() or turma_id in (select minhas_turmas())
  );
-- Professor cria/edita matéria apenas nas suas turmas; admin em qualquer.
create policy disciplinas_scope_write on disciplinas
  for all using (
    is_admin() or turma_id in (select minhas_turmas())
  ) with check (
    is_admin() or turma_id in (select minhas_turmas())
  );

-- ---------- matriculas_turmas (aluno na turma) ----------
drop policy if exists matriculas_turmas_select on matriculas_turmas;
drop policy if exists matriculas_turmas_prof_write on matriculas_turmas;
drop policy if exists matriculas_turmas_admin_write on matriculas_turmas;

create policy mt_scope_select on matriculas_turmas
  for select using (
    is_admin()
    or turma_id in (select minhas_turmas())
    or matricula_id in (select m.id from matriculas m where m.usuario_id = auth.uid())
  );
create policy mt_scope_write on matriculas_turmas
  for all using (
    is_admin() or turma_id in (select minhas_turmas())
  ) with check (
    is_admin() or turma_id in (select minhas_turmas())
  );

-- ---------- matriculas (alunos) ----------
drop policy if exists matriculas_select on matriculas;
drop policy if exists matriculas_aluno_select on matriculas;
drop policy if exists matriculas_prof_write on matriculas;
drop policy if exists matriculas_admin_write on matriculas;

-- SELECT: admin tudo; próprio aluno; professor vê alunos que estão nas suas turmas.
create policy matriculas_scope_select on matriculas
  for select using (
    is_admin()
    or usuario_id = auth.uid()
    or id in (
      select mt.matricula_id from matriculas_turmas mt
      where mt.turma_id in (select minhas_turmas())
    )
  );
-- Escrita: professor e admin (o vínculo à turma é feito em matriculas_turmas).
create policy matriculas_scope_write on matriculas
  for all using (is_professor_ou_admin()) with check (is_professor_ou_admin());

-- ---------- avaliacoes ----------
drop policy if exists avaliacoes_select on avaliacoes;
drop policy if exists avaliacoes_admin_write on avaliacoes;
drop policy if exists avaliacoes_prof_write on avaliacoes;

create policy avaliacoes_scope_select on avaliacoes
  for select using (
    is_admin()
    or disciplina_id in (
      select d.id from disciplinas d where d.turma_id in (select minhas_turmas())
    )
  );
create policy avaliacoes_scope_write on avaliacoes
  for all using (
    is_admin()
    or disciplina_id in (
      select d.id from disciplinas d where d.turma_id in (select minhas_turmas())
    )
  ) with check (
    is_admin()
    or disciplina_id in (
      select d.id from disciplinas d where d.turma_id in (select minhas_turmas())
    )
  );

-- ---------- notas ----------
drop policy if exists notas_select on notas;
drop policy if exists notas_prof_write on notas;
drop policy if exists notas_admin_write on notas;

create policy notas_scope_select on notas
  for select using (
    is_admin()
    or matricula_turma_id in (
      select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas())
    )
    or matricula_turma_id in (select minhas_matriculas_turmas())
  );
create policy notas_scope_write on notas
  for all using (
    is_admin()
    or matricula_turma_id in (
      select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas())
    )
  ) with check (
    is_admin()
    or matricula_turma_id in (
      select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas())
    )
  );

-- ---------- frequencias ----------
drop policy if exists frequencias_select on frequencias;
drop policy if exists frequencias_prof_write on frequencias;
drop policy if exists frequencias_admin_write on frequencias;

create policy frequencias_scope_select on frequencias
  for select using (
    is_admin()
    or matricula_turma_id in (
      select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas())
    )
    or matricula_turma_id in (select minhas_matriculas_turmas())
  );
create policy frequencias_scope_write on frequencias
  for all using (
    is_admin()
    or matricula_turma_id in (
      select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas())
    )
  ) with check (
    is_admin()
    or matricula_turma_id in (
      select mt.id from matriculas_turmas mt where mt.turma_id in (select minhas_turmas())
    )
  );

-- ---------- cursos: leitura para todos autenticados; escrita só admin ----------
drop policy if exists cursos_prof_write on cursos;
drop policy if exists cursos_admin_write on cursos;
create policy cursos_admin_write on cursos
  for all using (is_admin()) with check (is_admin());
