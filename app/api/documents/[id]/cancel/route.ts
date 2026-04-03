import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { getDocumentById, cancelApprovedDocument } from '@/lib/documents/document-service'
import { canCancelApprovedDocument } from '@/lib/auth/permissions'

export async function POST(
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

    if (
      !canCancelApprovedDocument(
        user.role,
        document.createdById,
        user.id,
        document.status
      )
    ) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'ไม่มีสิทธิ์ยกเลิกเอกสารนี้' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const remark = typeof body.remark === 'string' ? body.remark : ''
    if (!remark.trim()) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'กรุณาระบุเหตุผลการยกเลิก (remark)' },
        { status: 400 }
      )
    }

    const updated = await cancelApprovedDocument(id, user.id, remark)
    return NextResponse.json({ document: updated })
  } catch (error: any) {
    const msg = error?.message || 'ยกเลิกเอกสารไม่สำเร็จ'
    if (
      msg === 'กรุณาระบุเหตุผลการยกเลิก' ||
      msg.startsWith('ยกเลิกได้เฉพาะ') ||
      msg === 'Document not found'
    ) {
      return NextResponse.json({ error: msg, message: msg }, { status: 400 })
    }
    console.error('Error cancelling document:', error)
    return NextResponse.json({ error: 'Internal server error', message: msg }, { status: 500 })
  }
}
