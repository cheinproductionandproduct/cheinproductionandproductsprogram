import jsPDF from 'jspdf'
import type { Document, FormTemplate, User } from '@prisma/client'

interface DocumentWithRelations extends Document {
  formTemplate: FormTemplate
  creator: User | null
}

export function exportDocumentToPDF(document: DocumentWithRelations): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPosition = margin

  // Helper to add new page if needed
  const checkNewPage = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage()
      yPosition = margin
    }
  }

  // Company Header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('บริษัท เชน โปรดักชั่น แอนด์ โปรดักส์ จำกัด (สำนักงานใหญ่)', margin, yPosition)
  yPosition += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('159/25 ถ.สุวินทวงศ์ แขวงแสนแสบ เขตมีนบุรี กรุงเทพมหานคร 10510', margin, yPosition)
  yPosition += 5
  doc.text('เลขประจำตัวผู้เสียภาษี 0105559081883', margin, yPosition)
  yPosition += 5
  doc.text('โทร. +666 2635 9647 | เบอร์มือถือ +669 0897 9955, +668 3242 2380', margin, yPosition)
  yPosition += 10

  // Document Title
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(document.formTemplate.name, pageWidth - margin, yPosition, { align: 'right' })
  yPosition += 10

  // Document Metadata
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (document.documentNumber) {
    doc.text(`เลขที่: ${document.documentNumber}`, margin, yPosition)
  }
  doc.text(`วันที่: ${new Date(document.createdAt).toLocaleDateString('th-TH')}`, pageWidth - margin, yPosition, { align: 'right' })
  yPosition += 8

  // Horizontal line
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, pageWidth - margin, yPosition)
  yPosition += 10

  // Form Data
  const formData = document.data as Record<string, any>
  const formConfig = document.formTemplate.fields as any
  const fields = formConfig?.fields || []

  fields.forEach((field: any) => {
    checkNewPage(15)
    
    const value = formData[field.name]
    if (value === undefined || value === null || value === '') return

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${field.label}:`, margin, yPosition)
    
    doc.setFont('helvetica', 'normal')
    let displayValue = ''
    
    if (field.type === 'date' && value) {
      displayValue = new Date(value).toLocaleDateString('th-TH')
    } else if (field.type === 'items-table' && value?.items) {
      // Handle items table
      const items = value.items || []
      const total = value.total || 0
      displayValue = `จำนวน ${items.length} รายการ รวม ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท`
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value)
    } else {
      displayValue = String(value)
    }

    // Split long text into multiple lines
    const lines = doc.splitTextToSize(displayValue, pageWidth - margin * 2 - 50)
    doc.text(lines, margin + 50, yPosition)
    yPosition += lines.length * 5 + 5
  })

  // Footer
  const totalPages = (doc as any).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `หน้า ${i} จาก ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
  }

  return doc
}

export function downloadPDF(document: DocumentWithRelations, filename?: string) {
  const pdf = exportDocumentToPDF(document)
  const defaultFilename = filename || `${document.documentNumber || document.id}.pdf`
  pdf.save(defaultFilename)
}

