import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { prisma } from '@/lib/prisma'
import { canSetAdvanceRegisterTransferDate } from '@/lib/auth/permissions'
import { updateDocument } from '@/lib/documents/document-service'
import { DocumentStatus } from '@prisma/client'

function isIsoDateString(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!canSetAdvanceRegisterTransferDate(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { transferDate } = body || {}

    if (transferDate != null && transferDate !== '' && !isIsoDateString(transferDate)) {
      return NextResponse.json({ error: 'Invalid transferDate (expected YYYY-MM-DD)' }, { status: 400 })
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        data: true,
        formTemplate: {
          select: { slug: true },
        },
      },
    })

    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Only allow for APC documents (ใบเคลียร์เงินทดรองจ่าย)
    if (document.formTemplate?.slug !== 'advance-payment-clearance') {
      return NextResponse.json({ error: 'Not an Advance Payment Clearance document' }, { status: 400 })
    }

    // Allow updating even if not DRAFT — designated finance user records transfer.
    const nextData = {
      ...(document.data as Record<string, any>),
      transferDate: transferDate === '' || transferDate == null ? null : transferDate,
    }

    const updated = await updateDocument(
      document.id,
      { data: nextData },
      user.id
    )

    return NextResponse.json({
      document: updated,
      transferDate: nextData.transferDate,
      status: updated.status as DocumentStatus,
    })
  } catch (error: any) {
    console.error('Error updating transferDate:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message },
      { status: 500 }
    )
  }
}

