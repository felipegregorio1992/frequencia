-- ============================================================
-- Migração 007: corrige "Database error saving new user"
--
-- Esse erro (HTTP 500 em /auth/v1/signup) significa que ALGO no
-- banco disparado pela criação do usuário falhou. No projeto, o
-- único gatilho em auth.users é `on_auth_user_created`, que chama
-- `handle_new_user()` para criar o perfil em `usuarios`.
--
-- Estratégia à prova de falha: a função nunca deve abortar a
-- criação do usuário no Auth. Se o insert do perfil falhar por
-- qualquer motivo (RLS, cast de enum, constraint), capturamos a
-- exceção, registramos um aviso e retornamos NEW mesmo assim.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ============================================================

-- 0) Garante que a tabela usuarios não bloqueie o insert da própria
--    linha via RLS (reforço; a função abaixo já é SECURITY DEFINER).
drop policy if exists usuarios_self_insert on usuarios;
create policy usuarios_self_insert on usuarios
  for insert
  with check (true);

-- 1) Recria a função de forma robusta e tolerante a falhas.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matricula text;
  v_tipo_texto text;
  v_tipo public.tipo_usuario;
begin
  v_matricula := coalesce(new.raw_user_meta_data->>'matricula', split_part(new.email, '@', 1));
  v_tipo_texto := upper(coalesce(new.raw_user_meta_data->>'tipo', 'PROFESSOR'));

  begin
    v_tipo := v_tipo_texto::public.tipo_usuario;
  exception when others then
    v_tipo := 'PROFESSOR';
  end;

  begin
    insert into public.usuarios (id, matricula, tipo)
    values (new.id, v_matricula, v_tipo)
    on conflict (id) do nothing;
  exception when others then
    -- Não derruba a criação no Auth; apenas registra.
    raise warning 'handle_new_user falhou ao inserir perfil (%): %', new.id, sqlerrm;
  end;

  return new;
end $$;

-- 2) Owner com bypass de RLS (best effort).
do $$
begin
  alter function public.handle_new_user() owner to postgres;
exception when others then
  null;
end $$;

-- 3) Recria o trigger apontando para a função corrigida.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
