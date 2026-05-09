import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { hasRole } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { DocumentStatus, UserRole } from '@prisma/client'
import { sendLineMessage } from '@/lib/line/send-line'

/**
 * POST /api/documents/[id]/mark-status
 * body: { status: 'TRANSFERRED' | 'RETURNED' | 'TOPPED_UP' }
 *
 * TRANSFERRED — APR: money sent to requester (โอนแล้ว)
 *   Allowed from: APPROVED
 *   Who: MANAGER or ADMIN
 *
 * RETURNED — APC: requester returned excess (โอนคืนบริษัทแล้ว)
 *   Allowed from: CLEARED
 *   Who: MANAGER or ADMIN
 *
 * TOPPED_UP — APC: company sent top-up (บริษัทโอนส่วนเติมแล้ว)
 *   Allowed from: CLEARED
 *   Who: MANAGER or ADMIN
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || !hasRole(user.role as UserRole, UserRole.MANAGER)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { status: newStatus } = await req.json()
  const allowed = ['TRANSFERRED', 'RETURNED', 'TOPPED_UP']
  if (!allowed.includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { fullName: true, email: true } },
      formTemplate: { select: { name: true, slug: true } },
    },
  })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Validate allowed transitions
  const isAPR = doc.formTemplate.slug === 'advance-payment-request'
  const isAPC = doc.formTemplate.slug === 'advance-payment-clearance'

  if (newStatus === 'TRANSFERRED' && (!isAPR || doc.status !== 'APPROVED')) {
    return NextResponse.json({ error: 'โอนแล้วใช้ได้เฉพาะ APR ที่อนุมัติแล้ว' }, { status: 400 })
  }
  if ((newStatus === 'RETURNED' || newStatus === 'TOPPED_UP') && (!isAPC || doc.status !== 'CLEARED')) {
    return NextResponse.json({ error: 'ใช้ได้เฉพาะ APC ที่เคลียร์แล้ว' }, { status: 400 })
  }

  const updated = await prisma.document.update({
    where: { id: params.id },
    data: { status: newStatus as DocumentStatus },
  })

  // LINE notification
  const docNo = doc.documentNumber || params.id
  const creator = doc.creator.fullName || doc.creator.email
  const dateStr = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const lineMsg: Record<string, string> = {
    TRANSFERRED: `💸 โอนเงินทดรองแล้ว\nเลขที่: ${docNo}\nผู้เบิก: ${creator}\nวันที่: ${dateStr}`,
    RETURNED:    `✅ โอนคืนบริษัทแล้ว\nเลขที่: ${docNo}\nผู้เบิก: ${creator}\nวันที่: ${dateStr}`,
    TOPPED_UP:   `✅ บริษัทโอนส่วนเติมแล้ว\nเลขที่: ${docNo}\nผู้เบิก: ${creator}\nวันที่: ${dateStr}`,
  }

  await sendLineMessage(lineMsg[newStatus]).catch(() => null)

  return NextResponse.json({ ok: true, document: updated })
}
