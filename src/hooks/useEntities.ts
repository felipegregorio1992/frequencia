import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Traduz mensagens de erro comuns do Supabase/Postgres para PT-BR amigável.
export function traduzErro(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('duplicate key') || m.includes('unique')) return 'Registro duplicado: já existe um item com esses dados.'
  if (m.includes('foreign key')) return 'Não é possível excluir: há registros vinculados a este item.'
  if (m.includes('violates check constraint') && m.includes('peso')) return 'O peso deve ser maior que zero.'
  if (m.includes('violates check constraint') && m.includes('valor')) return 'A nota deve estar entre 0 e 10.'
  if (m.includes('violates not-null')) return 'Preencha todos os campos obrigatórios.'
  if (m.includes('row-level security') || m.includes('permission')) return 'Você não tem permissão para esta ação.'
  return message
}

// Hook genérico de listagem com select customizável.
export function useList<T>(table: string, select = '*', order?: string) {
  return useQuery({
    queryKey: [table, select, order],
    queryFn: async (): Promise<T[]> => {
      let query = supabase.from(table).select(select)
      if (order) query = query.order(order)
      const { data, error } = await query
      if (error) throw new Error(traduzErro(error.message))
      return (data ?? []) as unknown as T[]
    },
  })
}

// Hook de mutação (insert/update/delete) que invalida o cache da tabela.
export function useEntityMutations(table: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [table] })

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from(table).insert(payload)
      if (error) throw new Error(traduzErro(error.message))
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, payload }: { id: number | string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from(table).update(payload).eq('id', id)
      if (error) throw new Error(traduzErro(error.message))
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: number | string) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw new Error(traduzErro(error.message))
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
