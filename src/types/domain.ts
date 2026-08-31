// Tipos do domínio, traduzidos das entidades Java (com.faetec.nota.model)

export type TipoUsuario = 'ALUNO' | 'PROFESSOR' | 'ADMINISTRADOR'

export type TipoAvaliacao = 'av1' | 'av2' | 'av3'

export interface Usuario {
  id: string // uuid ligado ao auth.users do Supabase
  matricula: string
  tipo: TipoUsuario
  primeiro_acesso: boolean
  ativo: boolean
}

export interface Curso {
  id: number
  nome: string
}

export interface Disciplina {
  id: number
  nome: string
  curso_id: number | null
  turma_id: number | null
}

export interface Turma {
  id: number
  nome: string
  quantidade_tempos: number
  curso_id: number | null
}

// Vínculo N:N entre professores e turmas (admin gerencia).
export interface ProfessorTurma {
  id: number
  professor_id: string
  turma_id: number
}

// A matrícula representa o aluno; usuario_id liga à conta de login dele.
export interface Matricula {
  id: number
  codigo: string
  nome_aluno: string
  ativo: boolean
  usuario_id: string | null
}

export interface MatriculaTurma {
  id: number
  matricula_id: number
  turma_id: number
}

export interface Avaliacao {
  id: number
  tipo: TipoAvaliacao
  disciplina_id: number | null
  peso: number | null
}

export interface Nota {
  id: number
  matricula_turma_id: number
  avaliacao_id: number
  valor: number
}

export interface Frequencia {
  id: number
  matricula_turma_id: number
  data: string // ISO date
  presente: boolean
}
