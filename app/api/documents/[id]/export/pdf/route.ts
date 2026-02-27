import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { getDocumentById } from '@/lib/documents/document-service'
import { exportDocumentToPDF } from '@/lib/exports/pdf-export'

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

    const pdf = exportDocumentToPDF(document as any)
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.documentNumber || document.id}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting PDF:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

