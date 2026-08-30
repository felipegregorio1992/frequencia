-- ============================================================
-- Migração 001: relacionamentos e integridade
-- Corrige o modelo herdado do Java, adicionando o vínculo
-- Turma -> Curso e restrições de integridade coerentes.
-- Rode no SQL Editor OU via script apply-migration.
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ============================================================

-- ---------- Turma pertence a um Curso ----------
alter table turmas
  add column if not exists curso_id bigint references cursos(id) on delete cascade;

-- ---------- Disciplina: curso obrigatório + cascade ----------
-- Remove a FK antiga (on delete set null) e recria com cascade.
alter table disciplinas drop constraint if exists disciplinas_curso_id_fkey;
alter table disciplinas
  add constraint disciplinas_curso_id_fkey
  foreign key (curso_id) references cursos(id) on delete cascade;

-- ---------- Avaliação: peso obrigatório e positivo ----------
-- (regra que vinha do AvaliacaoService.java)
update avaliacoes set peso = 1.0 where peso is null or peso <= 0;
do $$ begin
  alter table avaliacoes add constraint avaliacoes_peso_positivo check (peso > 0);
exception when duplicate_object then null; end $$;

-- disciplina obrigatória na avaliação
alter table avaliacoes drop constraint if exists avaliacoes_disciplina_id_fkey;
alter table avaliacoes
  add constraint avaliacoes_disciplina_id_fkey
  foreign key (disciplina_id) references disciplinas(id) on delete cascade;

-- ---------- Nota: valor entre 0 e 10 ----------
do $$ begin
  alter table notas add constraint notas_valor_intervalo check (valor >= 0 and valor <= 10);
exception when duplicate_object then null; end $$;

-- ---------- Restrições de unicidade (evitam duplicatas) ----------
-- Um aluno não pode estar duas vezes na mesma turma.
do $$ begin
  alter table matriculas_turmas
    add constraint matriculas_turmas_unica unique (matricula_id, turma_id);
exception when duplicate_object then null; end $$;

-- Uma nota por (aluno-turma, avaliação).
do $$ begin
  alter table notas
    add constraint notas_unica unique (matricula_turma_id, avaliacao_id);
exception when duplicate_object then null; end $$;

-- Uma frequência por (aluno-turma, data).
do $$ begin
  alter table frequencias
    add constraint frequencias_unica unique (matricula_turma_id, data);
exception when duplicate_object then null; end $$;

-- ---------- Índices para os joins mais comuns ----------
create index if not exists idx_disciplinas_curso on disciplinas(curso_id);
create index if not exists idx_turmas_curso on turmas(curso_id);
create index if not exists idx_avaliacoes_disciplina on avaliacoes(disciplina_id);
create index if not exists idx_mt_matricula on matriculas_turmas(matricula_id);
create index if not exists idx_mt_turma on matriculas_turmas(turma_id);
create index if not exists idx_notas_mt on notas(matricula_turma_id);
create index if not exists idx_freq_mt on frequencias(matricula_turma_id);
