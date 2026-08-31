-- ============================================================
-- Migração 016: RPC para cadastrar aluno já vinculado a uma turma.
--
-- Motivo: ao inserir em `matriculas` e ler de volta (RETURNING) via
-- PostgREST, a policy de SELECT de matriculas exige que o aluno já
-- esteja numa turma do professor — o que só acontece no passo seguinte.
-- Resultado: o insert funciona mas o retorno vem vazio.
--
-- Esta RPC (security definer) cria a matrícula E o vínculo com a turma
-- atomicamente, validando que quem chama é admin OU professor da turma.
-- Retorna os dados criados. O trigger cria_login_do_aluno cuida do login.
-- Idempotente.
-- ============================================================

create or replace function public.cadastrar_aluno_na_turma(
  p_codigo text,
  p_nome text,
  p_turma_id bigint,
  p_ativo boolean default true
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
begin
  v_is_admin := exists (select 1 from usuarios where id = auth.uid() and tipo = 'ADMINISTRADOR');

  -- Só professor da turma (ou admin) pode cadastrar aluno nela.
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

  return json_build_object('ok', true, 'matricula_id', v_matricula_id);
exception
  when unique_violation then
    return json_build_object('error', 'Já existe um aluno com esse código.');
  when others then
    return json_build_object('error', sqlerrm);
end $$;

grant execute on function public.cadastrar_aluno_na_turma(text, text, bigint, boolean) to authenticated;
