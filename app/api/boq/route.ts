import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { canCreateBoq } from '@/lib/auth/permissions'

/**
 * GET /api/boq           – list all BOQ documents (with job name)
 * GET /api/boq?jobId=xxx – get the BOQ for a specific job
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const kind = searchParams.get('kind')

    if (jobId) {
      const boq = await (prisma as any).boqDocument.findFirst({
        where: { jobId },
      })
      return NextResponse.json({ boq: boq ?? null })
    }

    const where: Record<string, unknown> = {}
    if (kind === 'PLAN' || kind === 'ACTUAL') where.kind = kind

    // List BOQs with job — avoid nested `planBoq` include (breaks on stale Prisma client); attach plan via planBoqId
    const rows = await (prisma as any).boqDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        job: { select: { id: true, name: true, code: true } },
      },
    })
    const planIds = [...new Set(rows.map((b: { planBoqId: string | null }) => b.planBoqId).filter(Boolean))] as string[]
    const plans =
      planIds.length > 0
        ? await (prisma as any).boqDocument.findMany({
            where: { id: { in: planIds } },
            select: { id: true, title: true, job: { select: { name: true } } },
          })
        : []
    const planMap = new Map(plans.map((p: { id: string }) => [p.id, p]))
    const boqs = rows.map((b: { planBoqId: string | null }) => ({
      ...b,
      planBoq: b.planBoqId ? planMap.get(b.planBoqId) ?? { id: b.planBoqId, title: '', job: null } : null,
    }))
    return NextResponse.json({ boqs })
  } catch (err: any) {
    console.error('GET /api/boq error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/boq
 * Create a new BOQ document for a job.
 * Body: { jobId, data, showMaterial }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canCreateBoq(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { jobId, title, data, showMaterial, kind, planBoqId } = body

    const docKind = kind === 'ACTUAL' ? 'ACTUAL' : 'PLAN'
    let linkPlanId: string | null = null
    let initialData: unknown = data ?? []
    let initialShowMaterial = showMaterial ?? true
    let resolvedJobId: string | null = typeof jobId === 'string' && jobId ? jobId : null

    if (docKind === 'ACTUAL') {
      const pid = typeof planBoqId === 'string' && planBoqId.trim() ? planBoqId.trim() : null
      if (!pid) {
        return NextResponse.json({ error: 'Actual BOQ requires an approved Plan BOQ (planBoqId)' }, { status: 400 })
      }
      const plan = await (prisma as any).boqDocument.findUnique({ where: { id: pid } })
      if (!plan || plan.kind !== 'PLAN') {
        return NextResponse.json({ error: 'planBoqId must reference a PLAN BOQ' }, { status: 400 })
      }
      if (plan.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Plan BOQ must be approved before creating an Actual' }, { status: 400 })
      }
      linkPlanId = pid
      try {
        initialData = plan.data != null ? JSON.parse(JSON.stringify(plan.data)) : []
      } catch {
        initialData = []
      }
      initialShowMaterial = typeof showMaterial === 'boolean' ? showMaterial : (plan.showMaterial ?? true)
      if (!resolvedJobId && plan.jobId) resolvedJobId = plan.jobId
    }

    const boq = await (prisma as any).boqDocument.create({
      data: {
        jobId: resolvedJobId,
        title: title || '',
        kind: docKind,
        planBoqId: docKind === 'PLAN' ? null : linkPlanId,
        data: initialData,
        showMaterial: initialShowMaterial,
        createdById: user.id,
      },
    })

    return NextResponse.json({ boq }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/boq error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
