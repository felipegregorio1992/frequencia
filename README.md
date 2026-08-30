# Nota — Frontend (React + Supabase)

Frontend do sistema acadêmico **Nota**, reescrito do backend Java (Spring Boot) para
**React + TypeScript + Vite + Tailwind**, usando **Supabase** como banco de dados,
autenticação e API, com deploy na **Vercel**.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (com modo escuro)
- React Router (rotas com lazy loading)
- TanStack React Query (cache e revalidação de dados)
- Recharts (gráficos do dashboard)
- Lucide (ícones)
- Supabase (Postgres + Auth + RLS)

## Funcionalidades

- Login por matrícula, com layout split-screen
- Dashboard com cards e gráficos (distribuição de notas, frequência)
- CRUD completo: cursos, disciplinas, turmas, matrículas, avaliações, notas, frequências
- Associação aluno↔turma
- Boletim com média ponderada (usa o peso das avaliações) e % de frequência,
  com situação aprovado/reprovado (mínimo 75% de presença)
- Relatórios (rendimento, presença, consolidado por aluno) com filtro por turma,
  gráficos e exportação para PDF e Excel (libs carregadas sob demanda)
- Trocar senha (resolve o campo primeiro_acesso)
- Modo claro/escuro
- Toasts de sucesso/erro e modal de confirmação (sem `window.confirm`)
- Permissões e navegação por papel:
  - ADMINISTRADOR: gerencia tudo (inclui a tela de Usuários)
  - PROFESSOR: lança notas e frequências, vê relatórios
  - ALUNO: vê apenas o próprio desempenho (dashboard) e o boletim
  - O menu lateral mostra só o que o papel pode acessar; as rotas são protegidas
    por papel; a UI esconde ações de escrita; e o RLS garante a regra no banco.
- Dashboard adaptado ao papel (aluno vê suas notas/frequência; admin/professor
  veem a visão geral com gráficos).
- Fluxo de primeiro acesso: usuários com `primeiro_acesso = true` são levados
  à tela de troca de senha antes de usar o sistema.
- Cadastro de usuários pela interface (tela Usuários), via Edge Function segura.

## Edge Function: criar-usuario

Criar usuários no Supabase Auth exige a service role key, que **não pode** ficar
no frontend. Por isso o cadastro passa por uma Edge Function que roda no servidor,
valida que o chamador é ADMINISTRADOR e cria o usuário com segurança.

Deploy (uma vez), usando a Supabase CLI:

```bash
# na pasta frontend/
npx supabase login                       # abre o navegador para autenticar
npx supabase link --project-ref ulewxhylokigxkkoqxah
npx supabase functions deploy criar-usuario
```

Os secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já
são injetados automaticamente pelo Supabase nas Edge Functions. Depois do deploy,
a tela **Usuários** (admin) passa a criar alunos/professores/admins direto pela UI.

## Quem loga no sistema

Apenas **professores** e **administradores** têm login. **Alunos não logam** —
eles são registros na tabela `matriculas` (código + nome do aluno), gerenciados
pelos professores/admin.

## Domínio e relacionamentos

Tabelas: `usuarios` (professores/admin), `cursos`, `disciplinas`, `turmas`,
`matriculas` (alunos), `matriculas_turmas`, `avaliacoes`, `notas`, `frequencias`.

Relacionamentos (o modelo Java original não tinha o vínculo Turma→Curso; foi
adicionado aqui para dar integridade ao domínio):

```
Curso 1──N Disciplina        (disciplina.curso_id, NOT NULL)
Curso 1──N Turma             (turma.curso_id, NOT NULL)
Disciplina 1──N Avaliacao    (avaliacao.disciplina_id, NOT NULL; peso > 0)
Turma N──N Aluno             (via matriculas_turmas; par único)
MatriculaTurma 1──N Nota     (valor entre 0 e 10; par único com avaliação)
MatriculaTurma 1──N Frequencia (uma por data)
```

O script `supabase/schema.sql` já cria tudo com esses relacionamentos. Para bancos
criados numa versão anterior, aplique também `supabase/migrations/001_relacionamentos.sql`.

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie um projeto no [Supabase](https://supabase.com) e rode o script
   `supabase/schema.sql` em **SQL Editor** para criar as tabelas, políticas de RLS
   e o trigger de criação de perfil.

3. Copie `.env.example` para `.env.local` e preencha com os dados do seu projeto
   (Dashboard > Project Settings > API):
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sua-publishable-key
   ```

4. Rode em desenvolvimento:
   ```bash
   npm run dev
   ```

## Autenticação

O login é feito por **matrícula + senha**. Como o Supabase Auth exige um email,
a matrícula é mapeada internamente para `<matricula>@nota.local`.

### Criar o primeiro usuário (admin)

No Supabase Dashboard > **Authentication > Users > Add user**, crie um usuário com:

- Email: `admin@nota.local` (a matrícula será `admin`)
- Senha: a que desejar
- Em **User Metadata** (opcional), adicione `{ "tipo": "ADMINISTRADOR" }`

Se não definir o metadata, o usuário nasce como `ALUNO`. Você pode então
atualizar o tipo direto na tabela `usuarios` pelo SQL Editor:

```sql
update usuarios set tipo = 'ADMINISTRADOR' where matricula = 'admin';
```

Depois faça login no app usando a matrícula `admin` e a senha escolhida.

## Deploy na Vercel

1. Suba o projeto para um repositório Git.
2. Na Vercel, importe o repositório e defina o **Root Directory** como `frontend`.
3. Framework: **Vite** (detectado automaticamente). Build: `npm run build`,
   Output: `dist`.
4. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Deploy. O `vercel.json` já cuida do fallback de rotas do SPA.

## Estrutura

```
src/
  auth/        Contexto de autenticação (Supabase Auth) + papéis
  components/  Layout (sidebar) e rota protegida
  hooks/       useEntities (React Query genérico) + tradução de erros
  lib/         Cliente Supabase
  pages/       Todas as telas (login, dashboard, CRUDs, boletim, senha)
  types/       Tipos do domínio
  ui/          Tema (dark mode), toasts, confirm dialog, primitivos de UI
supabase/
  schema.sql          Schema completo + RLS + trigger
  migrations/         Migrações incrementais (relacionamentos, permissões)
```

## Aplicar migrações num banco existente

Se o banco foi criado antes das últimas mudanças, rode no SQL Editor, em ordem:

1. `supabase/migrations/001_relacionamentos.sql`
2. `supabase/migrations/002_permissoes_professor.sql`
3. `supabase/migrations/003_alunos_sem_login.sql`

Bancos novos já saem prontos apenas com o `schema.sql` + a migração 002 para as
permissões de professor.
