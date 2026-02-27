import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { getDocumentById } from '@/lib/documents/document-service'
import { exportDocumentToExcel } from '@/lib/exports/excel-export'
import * as XLSX from 'xlsx'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const document = await getDocumentById(id)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check permissions - creator, admin, or managers/approvers can export
    const { canApprove } = await import('@/lib/auth/permissions')
    if (document.createdById !== user.id && user.role !== 'ADMIN' && !canApprove(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const workbook = exportDocumentToExcel(document as any)
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${document.documentNumber || document.id}.xlsx"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting Excel:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

