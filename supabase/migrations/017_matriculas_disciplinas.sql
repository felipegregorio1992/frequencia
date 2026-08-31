-- ============================================================
-- Migração 017: aluno cursa matérias específicas da turma
--
-- Até aqui, o aluno vinculado a uma turma "cursava" automaticamente
-- TODAS as matérias dela. Agora cada aluno pode cursar apenas algumas
-- (uma, duas ou todas) das matérias da turma.
--
-- - matriculas_disciplinas: vínculo N:N aluno(matricula) <-> matéria(disciplina)
-- - RLS escopado pela turma da matéria (isolamento por professor)
-- - RPC cadastrar_aluno_na_turma atualizada: aceita lista de disciplinas
--   e cria os vínculos escolhidos (se não vier lista, vincula todas as
--   matérias da turma, mantendo compatibilidade).
-- Idempotente.
-- ============================================================

create table if not exists matriculas_disciplinas (
  id bigint generated always as identity primary key,
  matricula_id bigint not null references matriculas(id) on delete cascade,
  disciplina_id bigint not null references disciplinas(id) on delete cascade,
  unique (matricula_id, disciplina_id)
);
create index if not exists idx_md_matricula on matriculas_disciplinas(matricula_id);
create index if not exists idx_md_disciplina on matriculas_disciplinas(disciplina_id);

-- ---------- RLS ----------
alter table matriculas_disciplinas enable row level security;

-- SELECT: admin tudo; professor as das suas turmas; aluno as próprias.
drop policy if exists md_select on matriculas_disciplinas;
create policy md_select on matriculas_disciplinas
  for select using (
    is_admin()
    or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
    or matricula_id in (select m.id from matriculas m where m.usuario_id = auth.uid())
  );

-- Escrita separada por comando (evita o vazamento de leitura do FOR ALL).
drop policy if exists md_insert on matriculas_disciplinas;
create policy md_insert on matriculas_disciplinas
  for insert with check (
    is_admin()
    or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
  );
drop policy if exists md_delete on matriculas_disciplinas;
create policy md_delete on matriculas_disciplinas
  for delete using (
    is_admin()
    or disciplina_id in (select d.id from disciplinas d where d.turma_id in (select minhas_turmas()))
  );

-- ---------- RPC: cadastrar aluno na turma com matérias escolhidas ----------
-- Remove a versão antiga (4 args) para evitar ambiguidade de overload no PostgREST.
drop function if exists public.cadastrar_aluno_na_turma(text, text, bigint, boolean);

-- p_disciplinas: array de ids de disciplinas (matérias) da turma. Se NULL/vazio,
-- vincula todas as matérias da turma (comportamento antigo).
create or replace function public.cadastrar_aluno_na_turma(
  p_codigo text,
  p_nome text,
  p_turma_id bigint,
  p_ativo boolean default true,
  p_disciplinas bigint[] default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matricula_id bigint;
  v_is_admin boolean;
  v_pode boolean;
  v_disciplinas bigint[];
begin
  v_is_admin := exists (select 1 from usuarios where id = auth.uid() and tipo = 'ADMINISTRADOR');
  v_pode := v_is_admin or exists (
    select 1 from professores_turmas pt
    where pt.turma_id = p_turma_id and pt.professor_id = auth.uid()
  );
  if not v_pode then
    return json_build_object('error', 'Você não tem acesso a essa turma.');
  end if;

  if coalesce(trim(p_codigo), '') = '' or coalesce(trim(p_nome), '') = '' then
    return json_build_object('error', 'Informe código e nome do aluno.');
  end if;

  insert into matriculas (codigo, nome_aluno, ativo)
  values (trim(p_codigo), trim(p_nome), coalesce(p_ativo, true))
  returning id into v_matricula_id;

  insert into matriculas_turmas (matricula_id, turma_id)
  values (v_matricula_id, p_turma_id);

  -- Define as matérias: as escolhidas (validadas como da turma) ou todas da turma.
  if p_disciplinas is not null and array_length(p_disciplinas, 1) is not null then
    select array_agg(d.id) into v_disciplinas
    from disciplinas d
    where d.turma_id = p_turma_id and d.id = any(p_disciplinas);
  else
    select array_agg(d.id) into v_disciplinas
    from disciplinas d where d.turma_id = p_turma_id;
  end if;

  if v_disciplinas is not null then
    insert into matriculas_disciplinas (matricula_id, disciplina_id)
    select v_matricula_id, unnest(v_disciplinas)
    on conflict do nothing;
  end if;

  return json_build_object('ok', true, 'matricula_id', v_matricula_id);
exception
  when unique_violation then
    return json_build_object('error', 'Já existe um aluno com esse código.');
  when others then
    return json_build_object('error', sqlerrm);
end $$;

grant execute on function public.cadastrar_aluno_na_turma(text, text, bigint, boolean, bigint[]) to authenticated;
