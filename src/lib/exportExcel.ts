import ExcelJS from 'exceljs'

export async function exportExcel(
  data: Record<string, unknown>[],
  filename: string,
  headers: string[],
  cols: string[],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Dimos Inside'
  wb.created = new Date()

  const ws = wb.addWorksheet('Export', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = cols.map((col, i) => ({ header: headers[i] ?? col, key: col, width: 22 }))

  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    cell.alignment = { vertical: 'middle' }
  })

  data.forEach(row => {
    const rowData: Record<string, unknown> = {}
    cols.forEach(col => {
      const val = row[col]
      rowData[col] = val === null || val === undefined
        ? ''
        : typeof val === 'object' ? JSON.stringify(val) : val
    })
    ws.addRow(rowData)
  })

  ws.eachRow((row, i) => {
    if (i === 1) return
    row.eachCell(cell => { cell.alignment = { vertical: 'middle', wrapText: false } })
    if (i % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F5F9' } } })
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
