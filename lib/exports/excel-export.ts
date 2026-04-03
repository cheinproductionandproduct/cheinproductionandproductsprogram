import * as XLSX from 'xlsx'
import type { Document, FormTemplate, User } from '@prisma/client'
import { formatNumber } from '@/lib/utils/thai-number'

interface DocumentWithRelations extends Document {
  formTemplate: FormTemplate
  creator: User | null
}

export function exportDocumentToExcel(document: DocumentWithRelations): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const formData = document.data as Record<string, any>
  const formConfig = document.formTemplate.fields as any
  const fields = formConfig?.fields || []

  // Create main data sheet
  const data: any[][] = []
  
  // Header row
  data.push(['Field', 'Value'])
  
  // Add document metadata
  data.push(['Document Number', document.documentNumber || 'N/A'])
  data.push(['Title', document.title])
  data.push(['Status', document.status])
  data.push(['Created Date', new Date(document.createdAt).toLocaleString('th-TH')])
  data.push(['Created By', document.creator?.fullName || document.creator?.email || 'N/A'])
  data.push([]) // Empty row

  // Add form fields
  fields.forEach((field: any) => {
    const value = formData[field.name]
    if (value === undefined || value === null || value === '') return

    let displayValue = ''
    
    if (field.type === 'date' && value) {
      displayValue = new Date(value).toLocaleDateString('th-TH')
    } else if (field.type === 'number' && value !== '' && value != null) {
      displayValue = formatNumber(Number(value))
    } else if (field.type === 'items-table' && value?.items) {
      // Handle items table - create separate sheet
      const items = value.items || []
      const total = value.total || 0
      
      // Create items sheet
      const itemsData: any[][] = [
        ['ลำดับ', 'รายการ', 'จำนวนเงิน(บาท)']
      ]
      
      items.forEach((item: any, index: number) => {
        const amt = Number(item.amount)
        itemsData.push([
          index + 1,
          item.description || '',
          Number.isFinite(amt) ? Number(amt.toFixed(2)) : 0,
        ])
      })

      itemsData.push([])
      const totalNum = Number(total)
      itemsData.push([
        'รวม',
        '',
        Number.isFinite(totalNum) ? Number(totalNum.toFixed(2)) : 0,
      ])
      
      const itemsSheet = XLSX.utils.aoa_to_sheet(itemsData)
      XLSX.utils.book_append_sheet(workbook, itemsSheet, `${field.label} - Items`)
      
      displayValue = `จำนวน ${items.length} รายการ รวม ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท (ดูรายละเอียดใน Sheet "${field.label} - Items")`
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value)
    } else {
      displayValue = String(value)
    }

    data.push([field.label, displayValue])
  })

  // Create main sheet
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 30 }, // Field column
    { wch: 50 }, // Value column
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Document Data')

  return workbook
}

export function downloadExcel(document: DocumentWithRelations, filename?: string) {
  const workbook = exportDocumentToExcel(document)
  const defaultFilename = filename || `${document.documentNumber || document.id}.xlsx`
  XLSX.writeFile(workbook, defaultFilename)
}

