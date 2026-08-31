-- ============================================================
-- Migração 008: criar professor/administrador SEM Edge Function
-- e SEM signUp público (que esbarra em validação de e-mail e no
-- rate limit de confirmação).
--
-- Cria uma RPC `criar_usuario_admin` que:
--   * exige que QUEM chama seja ADMINISTRADOR (segurança);
--   * cria a conta em auth.users + auth.identities já confirmada;
--   * o trigger on_auth_user_created cria o perfil em `usuarios`.
--
-- O frontend chama via supabase.rpc('criar_usuario_admin', {...})
-- usando apenas a publishable key. A senha é hasheada no banco.
-- Idempotente.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.criar_usuario_admin(
  p_matricula text,
  p_senha text,
  p_tipo text
)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_login text := lower(trim(p_matricula));
  v_email text := lower(trim(p_matricula)) || '@nota.local';
  v_tipo  public.tipo_usuario;
  v_id    uuid := gen_random_uuid();
begin
  -- 1) Só administradores podem criar usuários.
  if not exists (
    select 1 from public.usuarios
    where id = auth.uid() and tipo = 'ADMINISTRADOR'
  ) then
    return json_build_object('error', 'Apenas administradores podem criar usuários.');
  end if;

  -- 2) Validações básicas.
  if v_login is null or length(v_login) = 0 then
    return json_build_object('error', 'Informe uma matrícula.');
  end if;
  if p_senha is null or length(p_senha) < 6 then
    return json_build_object('error', 'A senha deve ter ao menos 6 caracteres.');
  end if;

  begin
    v_tipo := upper(coalesce(p_tipo, 'PROFESSOR'))::public.tipo_usuario;
  exception when others then
    return json_build_object('error', 'Tipo inválido.');
  end;
  if v_tipo = 'ALUNO' then
    return json_build_object('error', 'Use PROFESSOR ou ADMINISTRADOR.');
  end if;

  -- 3) Já existe alguém com esse e-mail?
  if exists (select 1 from auth.users where email = v_email) then
    return json_build_object('error', 'Já existe um usuário com essa matrícula.');
  end if;

  -- 4) Cria a conta no Auth (já confirmada, senha hasheada com bcrypt).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new,
    email_change_token_current, recovery_token, phone_change,
    phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('matricula', v_login, 'tipo', v_tipo::text),
    now(), now(), '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_id, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email), 'email', now(), now());

  -- 5) Garante o perfil com o tipo correto (o trigger pode já ter criado).
  insert into public.usuarios (id, matricula, tipo)
  values (v_id, v_login, v_tipo)
  on conflict (id) do update set tipo = excluded.tipo, matricula = excluded.matricula;

  return json_build_object('ok', true, 'id', v_id, 'matricula', v_login);
exception when others then
  return json_build_object('error', sqlerrm);
end $$;

-- Somente usuários autenticados podem chamar (a checagem de admin é interna).
revoke all on function public.criar_usuario_admin(text, text, text) from public, anon;
grant execute on function public.criar_usuario_admin(text, text, text) to authenticated;
