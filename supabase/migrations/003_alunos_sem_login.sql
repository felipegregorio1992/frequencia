-- ============================================================
-- Migração 003: alunos não são mais usuários (não logam)
-- A matrícula passa a representar o aluno (código + nome),
-- sem vínculo com auth/usuarios. Só PROFESSOR e ADMINISTRADOR logam.
-- Idempotente onde possível.
-- ============================================================

-- 1) matriculas: adiciona nome do aluno e torna usuario_id opcional
alter table matriculas add column if not exists nome_aluno text;

-- Preenche nome_aluno para linhas antigas (usa a matrícula do usuário vinculado)
update matriculas m
set nome_aluno = coalesce(m.nome_aluno, u.matricula, 'Aluno ' || m.codigo)
from usuarios u
where m.usuario_id = u.id and m.nome_aluno is null;

update matriculas set nome_aluno = coalesce(nome_aluno, 'Aluno ' || codigo)
where nome_aluno is null;

alter table matriculas alter column nome_aluno set not null;

-- 2) Remove o vínculo obrigatório com usuarios
alter table matriculas drop constraint if exists matriculas_usuario_id_fkey;
alter table matriculas drop constraint if exists matriculas_usuario_id_key;
alter table matriculas drop column if exists usuario_id;

-- 3) Remove as contas de ALUNO do auth (cascata limpa o perfil em usuarios)
delete from auth.users
where id in (select id from usuarios where tipo = 'ALUNO');

-- 4) Ajusta o enum tipo_usuario para conter apenas PROFESSOR e ADMINISTRADOR.
--    (Postgres não remove valores de enum facilmente; recria o tipo.)
do $$
begin
  -- só recria se ainda existir o valor 'ALUNO'
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tipo_usuario' and e.enumlabel = 'ALUNO'
  ) then
    alter table usuarios alter column tipo drop default;
    alter type tipo_usuario rename to tipo_usuario_old;
    create type tipo_usuario as enum ('PROFESSOR', 'ADMINISTRADOR');
    alter table usuarios
      alter column tipo type tipo_usuario using tipo::text::tipo_usuario;
    alter table usuarios alter column tipo set default 'PROFESSOR';
    drop type tipo_usuario_old;
  end if;
end $$;

-- 5) Atualiza o trigger de novos usuários: default agora é PROFESSOR
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into usuarios (id, matricula, tipo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'matricula', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'tipo')::tipo_usuario, 'PROFESSOR')
  )
  on conflict (id) do nothing;
  return new;
end $$;
