-- ============================================================
-- Migração 012: modelo Turma -> Matéria (disciplina) -> Aluno
--
-- - professores_turmas: vínculo N:N entre professores e turmas
--   (admin cria a turma e relaciona os professores).
-- - disciplinas.turma_id: a matéria passa a pertencer a uma turma.
-- - curso_id deixa de ser obrigatório em disciplinas e turmas
--   (curso não é mais o centro do modelo). Mantido como opcional
--   para não quebrar dados existentes.
-- - minhas_turmas(): turmas do professor logado (base do isolamento).
-- Idempotente.
-- ============================================================

-- 1) Vínculo professor <-> turma
create table if not exists professores_turmas (
  id bigint generated always as identity primary key,
  professor_id uuid not null references usuarios(id) on delete cascade,
  turma_id bigint not null references turmas(id) on delete cascade,
  unique (professor_id, turma_id)
);
create index if not exists idx_pt_professor on professores_turmas(professor_id);
create index if not exists idx_pt_turma on professores_turmas(turma_id);

-- 2) disciplina pertence a uma turma
alter table disciplinas add column if not exists turma_id bigint references turmas(id) on delete cascade;
create index if not exists idx_disciplinas_turma on disciplinas(turma_id);

-- 3) curso_id deixa de ser obrigatório (turma é o centro agora)
do $$
begin
  alter table disciplinas alter column curso_id drop not null;
exception when others then null;
end $$;
do $$
begin
  alter table turmas alter column curso_id drop not null;
exception when others then null;
end $$;

-- 4) Função: turmas do professor logado (ou todas, se admin).
--    Usada pelas policies de isolamento.
create or replace function minhas_turmas()
returns setof bigint
language sql
security definer
stable
as $$
  select t.id
  from turmas t
  where
    -- admin enxerga todas as turmas
    exists (select 1 from usuarios u where u.id = auth.uid() and u.tipo = 'ADMINISTRADOR')
    -- professor enxerga as turmas às quais está vinculado
    or exists (
      select 1 from professores_turmas pt
      where pt.turma_id = t.id and pt.professor_id = auth.uid()
    );
$$;

grant execute on function minhas_turmas() to authenticated;
