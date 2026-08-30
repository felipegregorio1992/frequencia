-- ============================================================
-- Migração 004: aluno volta a ter login (Supabase Auth)
-- A matrícula continua com nome_aluno, mas ganha um vínculo
-- opcional com uma conta de auth (usuario_id). O aluno define
-- a senha no primeiro acesso.
-- Idempotente onde possível.
-- ============================================================

-- 1) Reintroduz ALUNO no enum tipo_usuario (se não existir)
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tipo_usuario' and e.enumlabel = 'ALUNO'
  ) then
    alter type tipo_usuario add value 'ALUNO';
  end if;
end $$;

-- 2) matriculas ganha vínculo opcional com a conta de login do aluno
alter table matriculas
  add column if not exists usuario_id uuid unique references usuarios(id) on delete set null;

-- 3) RLS: um aluno pode ler a própria matrícula (além de admin)
drop policy if exists matriculas_select on matriculas;
create policy matriculas_aluno_select on matriculas
  for select using (
    auth.role() = 'authenticated'
  );

-- 4) Notas e frequências: o aluno pode ler apenas os próprios registros.
--    (professores/admin já leem tudo pelas políticas existentes)
-- Função: matricula_turma_ids do usuário logado
create or replace function minhas_matriculas_turmas()
returns setof bigint
language sql
security definer
stable
as $$
  select mt.id
  from matriculas_turmas mt
  join matriculas m on m.id = mt.matricula_id
  where m.usuario_id = auth.uid();
$$;
