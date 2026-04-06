import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { canSubmitBoq, canSignBoq } from '@/lib/auth/permissions'

/**
 * PATCH /api/boq/[id]/status
 * Body: { action: 'submit' | 'approve' }
 *
 * submit  — pc@  moves DRAFT → PENDING
 * approve — bee@ moves PENDING → APPROVED
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { action } = await request.json()

    const boq = await (prisma as any).boqDocument.findUnique({ where: { id } })
    if (!boq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'submit') {
      if (!canSubmitBoq(user.email))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (boq.status !== 'DRAFT')
        return NextResponse.json({ error: 'Only DRAFT BOQs can be submitted' }, { status: 400 })

      const updated = await (prisma as any).boqDocument.update({
        where: { id },
        data: { status: 'PENDING' },
      })
      return NextResponse.json({ boq: updated })
    }

    if (action === 'approve') {
      if (!canSignBoq(user.email))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (boq.status !== 'PENDING')
        return NextResponse.json({ error: 'Only PENDING BOQs can be approved' }, { status: 400 })

      const updated = await (prisma as any).boqDocument.update({
        where: { id },
        data: { status: 'APPROVED' },
      })
      return NextResponse.json({ boq: updated })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('PATCH /api/boq/[id]/status error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
