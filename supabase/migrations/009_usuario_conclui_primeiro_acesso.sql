-- ============================================================
-- Migração 009: permitir que o próprio usuário conclua o
-- primeiro acesso (primeiro_acesso = false).
--
-- Bug: a única policy de escrita em `usuarios` era `usuarios_admin_all`
-- (apenas admin). Assim, um PROFESSOR não conseguia atualizar a própria
-- linha ao trocar a senha no primeiro acesso — o UPDATE era silenciosamente
-- bloqueado pelo RLS e `primeiro_acesso` ficava sempre true, prendendo o
-- usuário na tela "Trocar senha".
--
-- Correção: policy de UPDATE que permite ao usuário atualizar a PRÓPRIA
-- linha. Para não abrir escalonamento de privilégio (ex.: virar admin),
-- um trigger impede que o usuário altere `tipo`, `matricula` ou `ativo`
-- da própria conta — só admin pode mudar esses campos.
-- Idempotente.
-- ============================================================

-- 1) Policy: usuário pode atualizar a própria linha.
drop policy if exists usuarios_self_update on usuarios;
create policy usuarios_self_update on usuarios
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2) Trigger de proteção: se NÃO for admin, campos sensíveis não mudam.
create or replace function public.protege_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- admin pode tudo
  if exists (select 1 from public.usuarios where id = auth.uid() and tipo = 'ADMINISTRADOR') then
    return new;
  end if;
  -- usuário comum não pode alterar campos sensíveis da própria conta
  if new.tipo is distinct from old.tipo
     or new.matricula is distinct from old.matricula
     or new.ativo is distinct from old.ativo then
    raise exception 'Alteração não permitida.';
  end if;
  return new;
end $$;

drop trigger if exists trg_protege_campos_usuario on usuarios;
create trigger trg_protege_campos_usuario
  before update on usuarios
  for each row execute function public.protege_campos_usuario();
