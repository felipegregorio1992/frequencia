-- ============================================================
-- Migração 006: ao criar uma matrícula sem usuario_id, cria
-- automaticamente a conta de login do aluno (senha inicial = código,
-- primeiro_acesso = true). Assim o admin cadastra pela UI normal,
-- sem Edge Function.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function cria_login_do_aluno()
returns trigger
language plpgsql
security definer
as $$
declare
  novo_id uuid := gen_random_uuid();
  email text := lower(new.codigo) || '@nota.local';
begin
  -- se já veio com usuario_id (ex.: via Edge Function), não faz nada
  if new.usuario_id is not null then
    return new;
  end if;

  -- se já existe um auth.user com esse email, apenas vincula
  select id into novo_id from auth.users where email = email;
  if novo_id is null then
    novo_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new,
      email_change_token_current, recovery_token, phone_change,
      phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', novo_id,
      'authenticated', 'authenticated', email,
      crypt(lower(new.codigo), gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('matricula', lower(new.codigo), 'tipo', 'ALUNO'),
      now(), now(), '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (novo_id, novo_id, jsonb_build_object('sub', novo_id::text, 'email', email), 'email', now(), now());
  end if;

  -- garante o perfil como ALUNO em primeiro acesso
  update usuarios set tipo = 'ALUNO', primeiro_acesso = true where id = novo_id;

  new.usuario_id := novo_id;
  return new;
end $$;

drop trigger if exists trg_cria_login_aluno on matriculas;
create trigger trg_cria_login_aluno
  before insert on matriculas
  for each row execute function cria_login_do_aluno();
