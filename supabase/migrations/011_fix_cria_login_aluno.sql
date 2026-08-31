-- ============================================================
-- Migração 011: corrige a trigger que cria o login do aluno.
--
-- Bugs na função original (migração 006):
--  1) A variável local chamava-se `email`, igual à coluna
--     auth.users.email -> "column reference email is ambiguous"
--     ao inserir em `matriculas`. Isso quebrava o cadastro de alunos.
--  2) `select ... where email = email` comparava a variável com ela
--     mesma (sempre verdadeiro), lógica incorreta para localizar
--     uma conta existente.
--
-- Correção: renomeia a variável para v_email e qualifica a coluna
-- (auth.users.email). Comportamento: cria a conta de login do aluno
-- (senha inicial = código da matrícula, primeiro_acesso = true) e
-- vincula em matriculas.usuario_id. Idempotente.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function cria_login_do_aluno()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  novo_id uuid;
  v_email text := lower(new.codigo) || '@nota.local';
begin
  -- se já veio com usuario_id (ex.: via outro fluxo), não faz nada
  if new.usuario_id is not null then
    return new;
  end if;

  -- se já existe um auth.user com esse email, apenas vincula
  select au.id into novo_id from auth.users au where au.email = v_email;

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
      'authenticated', 'authenticated', v_email,
      extensions.crypt(lower(new.codigo), extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('matricula', lower(new.codigo), 'tipo', 'ALUNO'),
      now(), now(), '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (novo_id, novo_id, jsonb_build_object('sub', novo_id::text, 'email', v_email), 'email', now(), now());
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
