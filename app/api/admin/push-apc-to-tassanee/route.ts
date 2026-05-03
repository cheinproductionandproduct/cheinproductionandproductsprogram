import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { isAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

/**
 * Re-assigns all PENDING APC documents to tassanee at whatever step they are currently on.
 * Also fixes DRAFT APC documents so tassanee is the step-1 assignee in userAssignments.
 */
export async function POST() {
  const user = await getCurrentUser()
  if (!user || !isAdmin(user.role as UserRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const tassanee = await prisma.user.findFirst({
    where: { email: { contains: 'tassanee@chein', mode: 'insensitive' } },
    select: { id: true, fullName: true, email: true },
  })
  if (!tassanee) {
    return NextResponse.json({ ok: false, error: 'ไม่พบ user tassanee' }, { status: 400 })
  }

  const template = await prisma.formTemplate.findFirst({
    where: { slug: 'advance-payment-clearance' },
    select: { id: true },
  })
  if (!template) {
    return NextResponse.json({ ok: false, error: 'ไม่พบ template APC' }, { status: 400 })
  }

  // 1. Update PENDING APC documents — reassign all PENDING approvals to tassanee
  const pendingDocs = await prisma.document.findMany({
    where: { formTemplateId: template.id, status: 'PENDING' },
    select: { id: true, currentStep: true },
  })

  let approvalsUpdated = 0
  for (const doc of pendingDocs) {
    const updated = await prisma.approval.updateMany({
      where: {
        documentId: doc.id,
        status: 'PENDING',
        workflowStep: { stepNumber: doc.currentStep ?? 1 },
      },
      data: { approverId: tassanee.id },
    })
    approvalsUpdated += updated.count
  }

  // 2. Update DRAFT APC documents — set tassanee as approver in userAssignments
  const draftDocs = await prisma.document.findMany({
    where: { formTemplateId: template.id, status: 'DRAFT' },
    select: { id: true, data: true },
  })

  let draftsUpdated = 0
  for (const doc of draftDocs) {
    const data = (doc.data ?? {}) as Record<string, any>
    const ua = data.userAssignments ?? {}
    await prisma.document.update({
      where: { id: doc.id },
      data: { data: { ...data, userAssignments: { ...ua, approver: tassanee.id } } },
    })
    draftsUpdated++
  }

  return NextResponse.json({
    ok: true,
    tassanee: tassanee.fullName || tassanee.email,
    pendingDocsFound: pendingDocs.length,
    approvalsUpdated,
    draftDocsUpdated: draftsUpdated,
  })
}
