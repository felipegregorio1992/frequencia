import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../ui/ToastContext'
import { PageHeader } from '../ui/primitives'
import { traduzErro } from '../hooks/useEntities'

export default function SenhaPage() {
  const { notify } = useToast()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (novaSenha.length < 6) {
      notify('A senha deve ter ao menos 6 caracteres.', 'error')
      return
    }
    if (novaSenha !== confirmar) {
      notify('As senhas não coincidem.', 'error')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      if (error) throw error
      // marca que o primeiro acesso foi concluído
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        await supabase.from('usuarios').update({ primeiro_acesso: false }).eq('id', data.user.id)
      }
      notify('Senha alterada com sucesso.', 'success')
      setNovaSenha('')
      setConfirmar('')
    } catch (err) {
      notify(err instanceof Error ? traduzErro(err.message) : 'Erro ao alterar senha.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="Trocar senha" description="Defina uma nova senha de acesso." />
      <form onSubmit={handleSubmit} className="card max-w-md space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Nova senha
          </label>
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="input"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirmar nova senha
          </label>
          <input
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="input"
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </button>
      </form>
    </div>
  )
}
