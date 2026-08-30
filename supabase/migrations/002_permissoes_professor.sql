-- ============================================================
-- Migração 002: professores podem lançar notas e frequências
-- Além do admin, quem for PROFESSOR pode escrever em notas e frequencias.
-- Idempotente.
-- ============================================================

create or replace function is_professor_ou_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and tipo in ('PROFESSOR', 'ADMINISTRADOR')
  );
$$;

-- notas: substitui a política de escrita "somente admin" por "professor ou admin"
drop policy if exists notas_admin_write on notas;
drop policy if exists notas_prof_write on notas;
create policy notas_prof_write on notas
  for all using (is_professor_ou_admin()) with check (is_professor_ou_admin());

-- frequencias: idem
drop policy if exists frequencias_admin_write on frequencias;
drop policy if exists frequencias_prof_write on frequencias;
create policy frequencias_prof_write on frequencias
  for all using (is_professor_ou_admin()) with check (is_professor_ou_admin());
