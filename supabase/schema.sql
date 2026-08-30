-- ============================================================
-- Schema do sistema Nota (migrado do backend Java Spring Boot)
-- Rode este script no Supabase: Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- Tipos (enums) ----------
-- Apenas quem loga no sistema: professores e administradores.
-- Alunos NÃO são usuários (não logam); são registros em `matriculas`.
do $$ begin
  create type tipo_usuario as enum ('PROFESSOR', 'ADMINISTRADOR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_avaliacao as enum ('av1', 'av2', 'av3');
exception when duplicate_object then null; end $$;

-- ---------- usuarios (professores e administradores) ----------
-- Ligado 1:1 ao auth.users do Supabase (id = auth.users.id)
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  matricula text not null unique,
  tipo tipo_usuario not null default 'PROFESSOR',
  primeiro_acesso boolean not null default true,
  ativo boolean not null default true
);

-- ---------- cursos ----------
create table if not exists cursos (
  id bigint generated always as identity primary key,
  nome text not null
);

-- ---------- disciplinas ----------
-- Uma disciplina pertence obrigatoriamente a um curso.
create table if not exists disciplinas (
  id bigint generated always as identity primary key,
  nome text not null,
  curso_id bigint not null references cursos(id) on delete cascade
);

-- ---------- turmas ----------
-- Uma turma pertence obrigatoriamente a um curso.
create table if not exists turmas (
  id bigint generated always as identity primary key,
  nome text not null,
  quantidade_tempos integer not null,
  curso_id bigint not null references cursos(id) on delete cascade
);

-- ---------- matriculas (representam os alunos; não logam) ----------
create table if not exists matriculas (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  nome_aluno text not null,
  ativo boolean not null default true
);

-- ---------- matriculas_turmas ----------
-- Um aluno (matrícula) não pode estar duas vezes na mesma turma.
create table if not exists matriculas_turmas (
  id bigint generated always as identity primary key,
  matricula_id bigint not null references matriculas(id) on delete cascade,
  turma_id bigint not null references turmas(id) on delete cascade,
  unique (matricula_id, turma_id)
);

-- ---------- avaliacoes ----------
-- Peso obrigatório e positivo (regra vinda do AvaliacaoService.java).
create table if not exists avaliacoes (
  id bigint generated always as identity primary key,
  tipo tipo_avaliacao not null,
  disciplina_id bigint not null references disciplinas(id) on delete cascade,
  peso double precision not null check (peso > 0)
);

-- ---------- notas ----------
-- Valor entre 0 e 10; uma nota por (aluno-turma, avaliação).
create table if not exists notas (
  id bigint generated always as identity primary key,
  matricula_turma_id bigint not null references matriculas_turmas(id) on delete cascade,
  avaliacao_id bigint not null references avaliacoes(id) on delete cascade,
  valor double precision not null check (valor >= 0 and valor <= 10),
  unique (matricula_turma_id, avaliacao_id)
);

-- ---------- frequencias ----------
-- Uma frequência por (aluno-turma, data).
create table if not exists frequencias (
  id bigint generated always as identity primary key,
  matricula_turma_id bigint not null references matriculas_turmas(id) on delete cascade,
  data date not null,
  presente boolean not null,
  unique (matricula_turma_id, data)
);

-- ---------- Índices para os joins mais comuns ----------
create index if not exists idx_disciplinas_curso on disciplinas(curso_id);
create index if not exists idx_turmas_curso on turmas(curso_id);
create index if not exists idx_avaliacoes_disciplina on avaliacoes(disciplina_id);
create index if not exists idx_mt_matricula on matriculas_turmas(matricula_id);
create index if not exists idx_mt_turma on matriculas_turmas(turma_id);
create index if not exists idx_notas_mt on notas(matricula_turma_id);
create index if not exists idx_freq_mt on frequencias(matricula_turma_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Função auxiliar: verifica se o usuário logado é ADMINISTRADOR
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and tipo = 'ADMINISTRADOR'
  );
$$;

-- Habilita RLS
alter table usuarios enable row level security;
alter table cursos enable row level security;
alter table disciplinas enable row level security;
alter table turmas enable row level security;
alter table matriculas enable row level security;
alter table matriculas_turmas enable row level security;
alter table avaliacoes enable row level security;
alter table notas enable row level security;
alter table frequencias enable row level security;

-- usuarios: cada um lê o próprio perfil; admin gerencia todos
create policy usuarios_self_select on usuarios
  for select using (id = auth.uid() or is_admin());
create policy usuarios_admin_all on usuarios
  for all using (is_admin()) with check (is_admin());

-- Tabelas acadêmicas: qualquer usuário autenticado pode ler;
-- apenas admin pode escrever.
do $$
declare t text;
begin
  foreach t in array array[
    'cursos','disciplinas','turmas','matriculas','matriculas_turmas',
    'avaliacoes','notas','frequencias'
  ] loop
    execute format(
      'create policy %I_select on %I for select using (auth.role() = ''authenticated'');',
      t, t);
    execute format(
      'create policy %I_admin_write on %I for all using (is_admin()) with check (is_admin());',
      t, t);
  end loop;
end $$;

-- ============================================================
-- Trigger: cria automaticamente uma linha em `usuarios`
-- quando um novo usuário é criado no Supabase Auth.
-- A matrícula vem do metadata (raw_user_meta_data->>'matricula')
-- ou é derivada do email (parte antes do @).
-- ============================================================
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
