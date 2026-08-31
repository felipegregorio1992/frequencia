-- ============================================================
-- Migração 010: professor pode gerenciar o acadêmico
--
-- Além do admin, um PROFESSOR passa a poder criar/editar:
--   cursos, disciplinas (matérias), turmas, matriculas (alunos)
--   e matriculas_turmas (vínculo aluno-turma).
--
-- Notas e frequências já eram liberadas para professor (migração 002).
-- Usa a função is_professor_ou_admin() criada na migração 002.
-- Idempotente.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'cursos','disciplinas','turmas','matriculas','matriculas_turmas'
  ] loop
    -- remove a policy de escrita "somente admin" (nome padrão do schema)
    execute format('drop policy if exists %I_admin_write on %I;', t, t);
    -- remove eventual policy anterior de professor (idempotência)
    execute format('drop policy if exists %I_prof_write on %I;', t, t);
    -- cria a policy de escrita para professor OU admin
    execute format(
      'create policy %I_prof_write on %I for all using (is_professor_ou_admin()) with check (is_professor_ou_admin());',
      t, t);
  end loop;
end $$;
