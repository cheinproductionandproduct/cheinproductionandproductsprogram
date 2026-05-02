import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { isAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

/**
 * Rebuild the APC (advance-payment-clearance) approval workflow to 3 sequential steps:
 *   Step 1 — ผู้ตรวจสอบ/อนุมัติ  (tassanee, MANAGER role)
 *   Step 2 — ผู้รับเคลียร์เงิน   (pc, APPROVER role)
 *   Step 3 — ผู้อนุมัติ          (bee, APPROVER role)
 */
export async function POST() {
  const user = await getCurrentUser()
  if (!user || !isAdmin(user.role as UserRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const template = await prisma.formTemplate.findFirst({
    where: { slug: 'advance-payment-clearance' },
    include: { approvalWorkflow: { include: { steps: true } } },
  })

  if (!template?.approvalWorkflow) {
    return NextResponse.json({ ok: false, error: 'APC workflow not found' }, { status: 404 })
  }

  const workflowId = template.approvalWorkflow.id

  // Delete all existing steps and replace with 3-step sequential flow
  await prisma.workflowStep.deleteMany({ where: { workflowId } })

  const steps = await prisma.workflowStep.createMany({
    data: [
      {
        workflowId,
        stepNumber: 1,
        name: 'ผู้ตรวจสอบ/อนุมัติ',
        description: 'ตรวจสอบและอนุมัติเอกสารเคลียร์เงินทดรอง',
        assigneeRole: UserRole.MANAGER,
        canApprove: true,
        canReject: true,
      },
      {
        workflowId,
        stepNumber: 2,
        name: 'ผู้รับเคลียร์เงิน',
        description: 'ผู้รับเคลียร์เงินรับทราบและลงนาม',
        assigneeRole: UserRole.APPROVER,
        canApprove: true,
        canReject: true,
      },
      {
        workflowId,
        stepNumber: 3,
        name: 'ผู้อนุมัติ',
        description: 'อนุมัติขั้นสุดท้าย',
        assigneeRole: UserRole.APPROVER,
        canApprove: true,
        canReject: true,
      },
    ],
  })

  return NextResponse.json({
    ok: true,
    stepsCreated: steps.count,
    message: 'APC workflow updated to 3 steps: ผู้ตรวจสอบ → ผู้รับเคลียร์เงิน → ผู้อนุมัติ',
  })
}
