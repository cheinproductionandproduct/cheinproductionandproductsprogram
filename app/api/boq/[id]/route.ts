import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { canDeleteBoq, canEditBoq } from '@/lib/auth/permissions'

/**
 * GET /api/boq/[id]
 * Fetch a single BOQ document with its job info.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const row = await (prisma as any).boqDocument.findUnique({
      where: { id },
      include: {
        job: { select: { id: true, name: true, code: true } },
      },
    })

    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let planBoq: { id: string; title: string; job: { name: string } | null } | null = null
    if (row.planBoqId) {
      planBoq = await (prisma as any).boqDocument.findUnique({
        where: { id: row.planBoqId },
        select: { id: true, title: true, job: { select: { name: true } } },
      })
    }
    const boq = { ...row, planBoq }
    return NextResponse.json({ boq })
  } catch (err: any) {
    console.error('GET /api/boq/[id] error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/boq/[id]
 * Update an existing BOQ document (editor only).
 * Body: { data, showMaterial }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canEditBoq(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { data, showMaterial, title, jobId } = body

    const boq = await (prisma as any).boqDocument.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(jobId !== undefined && { jobId: jobId || null }),
        data: data ?? [],
        showMaterial: showMaterial ?? true,
        updatedAt: new Date(),
      },
      include: { job: { select: { id: true, name: true, code: true } } },
    })

    return NextResponse.json({ boq })
  } catch (err: any) {
    console.error('PUT /api/boq/[id] error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canDeleteBoq(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    await (prisma as any).boqDocument.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('DELETE /api/boq/[id] error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
