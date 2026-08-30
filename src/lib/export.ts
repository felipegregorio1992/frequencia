import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export interface Secao {
  titulo: string
  colunas: string[]
  linhas: (string | number)[][]
}

// Exporta uma ou mais seções (tabelas) para PDF.
export function exportarPDF(titulo: string, secoes: Secao[], nomeArquivo: string) {
  const doc = new jsPDF()
  const dataAtual = new Date().toLocaleDateString('pt-BR')

  doc.setFontSize(16)
  doc.text(titulo, 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text(`Gerado em ${dataAtual} — Sistema Nota`, 14, 24)

  let y = 32
  for (const secao of secoes) {
    doc.setFontSize(12)
    doc.setTextColor(30)
    doc.text(secao.titulo, 14, y)
    autoTable(doc, {
      head: [secao.colunas],
      body: secao.linhas.map((l) => l.map((c) => String(c))),
      startY: y + 3,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] },
      margin: { left: 14, right: 14 },
    })
    // posição após a tabela
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
    if (y > 260) {
      doc.addPage()
      y = 20
    }
  }

  doc.save(`${nomeArquivo}.pdf`)
}

// Exporta uma ou mais seções para Excel (cada seção vira uma aba).
export function exportarExcel(secoes: Secao[], nomeArquivo: string) {
  const wb = XLSX.utils.book_new()
  for (const secao of secoes) {
    const dados = [secao.colunas, ...secao.linhas]
    const ws = XLSX.utils.aoa_to_sheet(dados)
    // largura automática simples
    ws['!cols'] = secao.colunas.map((_, i) => {
      const larguras = [secao.colunas[i].length, ...secao.linhas.map((l) => String(l[i] ?? '').length)]
      return { wch: Math.min(40, Math.max(10, ...larguras) + 2) }
    })
    const nomeAba = secao.titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, '')
    XLSX.utils.book_append_sheet(wb, ws, nomeAba || 'Dados')
  }
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`)
}
