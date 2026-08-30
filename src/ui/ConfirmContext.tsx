import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    setState(options)
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve)
    })
  }, [])

  function close(result: boolean) {
    resolver?.(result)
    setState(null)
    setResolver(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2 dark:bg-red-950">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {state.title ?? 'Confirmar ação'}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{state.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => close(false)} className="btn-ghost">
                {state.cancelText ?? 'Cancelar'}
              </button>
              <button
                onClick={() => close(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                {state.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de <ConfirmProvider>')
  return ctx
}
