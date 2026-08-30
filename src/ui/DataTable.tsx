import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Spinner, EmptyState } from './primitives'

export interface Column<T> {
  key: string
  header: string
  // valor bruto usado para busca e ordenação
  accessor?: (row: T) => string | number
  // renderização customizada da célula (badges, botões, etc.)
  render?: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  emptyMessage?: string
  searchPlaceholder?: string
  pageSize?: number
  // opções do seletor "itens por página"
  pageSizeOptions?: number[]
  // desativa a barra de busca quando não faz sentido
  searchable?: boolean
}

type SortDir = 'asc' | 'desc'

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyMessage = 'Nenhum registro encontrado.',
  searchPlaceholder = 'Buscar...',
  pageSize = 10,
  pageSizeOptions = [5, 10, 25, 50, 100],
  searchable = true,
}: DataTableProps<T>) {
  const [busca, setBusca] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [pagina, setPagina] = useState(1)
  const [tamanhoPagina, setTamanhoPagina] = useState(pageSize)

  const valorBruto = (row: T, col: Column<T>): string | number => {
    if (col.accessor) return col.accessor(row)
    const v = (row as Record<string, unknown>)[col.key]
    return typeof v === 'number' ? v : String(v ?? '')
  }

  // 1) Filtro por busca (concatena os valores das colunas com accessor/valor)
  const filtrados = useMemo(() => {
    if (!busca.trim()) return data
    const termo = busca.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => String(valorBruto(row, col)).toLowerCase().includes(termo)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, busca, columns])

  // 2) Ordenação
  const ordenados = useMemo(() => {
    if (!sortKey) return filtrados
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return filtrados
    const arr = [...filtrados]
    arr.sort((a, b) => {
      const va = valorBruto(a, col)
      const vb = valorBruto(b, col)
      let cmp: number
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
      else cmp = String(va).localeCompare(String(vb), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, sortKey, sortDir, columns])

  // 3) Paginação
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / tamanhoPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * tamanhoPagina
  const visiveis = ordenados.slice(inicio, inicio + tamanhoPagina)

  function toggleSort(col: Column<T>) {
    if (col.sortable === false) return
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
    setPagina(1)
  }

  const alinhamento = (a?: string) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3 dark:border-slate-800">
        {searchable ? (
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              placeholder={searchPlaceholder}
              className="input pl-9"
            />
          </div>
        ) : (
          <span />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Mostrar
          <select
            value={tamanhoPagina}
            onChange={(e) => {
              setTamanhoPagina(Number(e.target.value))
              setPagina(1)
            }}
            className="input w-auto py-1.5"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          por página
        </label>
      </div>

      {loading ? (
        <Spinner />
      ) : ordenados.length === 0 ? (
        <EmptyState message={busca ? 'Nenhum resultado para a busca.' : emptyMessage} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  {columns.map((col) => {
                    const ativo = sortKey === col.key
                    const podeOrdenar = col.sortable !== false
                    return (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col)}
                        className={`px-4 py-3 font-medium ${alinhamento(col.align)} ${
                          podeOrdenar ? 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200' : ''
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.header}
                          {podeOrdenar &&
                            (ativo ? (
                              sortDir === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                            ))}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((row) => (
                  <tr key={rowKey(row)} className="border-t border-slate-100 dark:border-slate-800">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 ${alinhamento(col.align)} ${col.className ?? 'text-slate-800 dark:text-slate-100'}`}
                      >
                        {col.render ? col.render(row) : String(valorBruto(row, col))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rodapé de paginação */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Mostrando {inicio + 1}–{Math.min(inicio + tamanhoPagina, ordenados.length)} de{' '}
              {ordenados.length} {ordenados.length === 1 ? 'registro' : 'registros'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(1)}
                disabled={paginaAtual === 1}
                title="Primeira página"
                className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                title="Anterior"
                className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                title="Próxima"
                className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPagina(totalPaginas)}
                disabled={paginaAtual === totalPaginas}
                title="Última página"
                className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
