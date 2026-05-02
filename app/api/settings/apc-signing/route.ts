import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { hasRole } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

const STEP_NAMES = [
  { stepNumber: 1, name: 'ผู้ตรวจสอบ/อนุมัติ', description: 'ตรวจสอบและอนุมัติเอกสาร', assigneeRole: UserRole.MANAGER },
  { stepNumber: 2, name: 'ผู้รับเคลียร์เงิน',    description: 'ผู้รับเคลียร์เงินลงนาม',    assigneeRole: UserRole.APPROVER },
  { stepNumber: 3, name: 'ผู้อนุมัติ',            description: 'อนุมัติขั้นสุดท้าย',        assigneeRole: UserRole.APPROVER },
]

async function getWorkflowWithSteps() {
  const template = await prisma.formTemplate.findFirst({
    where: { slug: 'advance-payment-clearance' },
    include: {
      approvalWorkflow: {
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
            include: { assignee: { select: { id: true, fullName: true, email: true } } },
          },
        },
      },
    },
  })
  return template?.approvalWorkflow ?? null
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user || !hasRole(user.role as UserRole, UserRole.MANAGER)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const [workflow, users] = await Promise.all([
    getWorkflowWithSteps(),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  const steps = STEP_NAMES.map(s => {
    const dbStep = workflow?.steps.find(ws => ws.stepNumber === s.stepNumber)
    return {
      stepNumber: s.stepNumber,
      name: s.name,
      assigneeId: dbStep?.assigneeId ?? null,
      assignee: dbStep?.assignee ?? null,
    }
  })

  return NextResponse.json({ steps, users })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !hasRole(user.role as UserRole, UserRole.MANAGER)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { step1UserId, step2UserId, step3UserId } = await req.json()
  const assignments: Record<number, string | null> = {
    1: step1UserId || null,
    2: step2UserId || null,
    3: step3UserId || null,
  }

  let workflow = await getWorkflowWithSteps()
  if (!workflow) {
    return NextResponse.json({ error: 'APC workflow not found' }, { status: 404 })
  }

  // Ensure all 3 steps exist, then update assigneeId
  for (const s of STEP_NAMES) {
    const existing = workflow.steps.find(ws => ws.stepNumber === s.stepNumber)
    if (existing) {
      await prisma.workflowStep.update({
        where: { id: existing.id },
        data: { assigneeId: assignments[s.stepNumber], name: s.name },
      })
    } else {
      await prisma.workflowStep.create({
        data: {
          workflowId: workflow.id,
          stepNumber: s.stepNumber,
          name: s.name,
          description: s.description,
          assigneeRole: s.assigneeRole,
          assigneeId: assignments[s.stepNumber],
          canApprove: true,
          canReject: true,
        },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
