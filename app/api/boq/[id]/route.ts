import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'

/**
 * GET /api/boq/[id]
 * Fetch a single BOQ document with its job info.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const boq = await (prisma as any).boqDocument.findUnique({
      where: { id: params.id },
      include: { job: { select: { id: true, name: true, code: true } } },
    })

    if (!boq) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { data, showMaterial } = body

    const boq = await (prisma as any).boqDocument.update({
      where: { id: params.id },
      data: {
        data: data ?? [],
        showMaterial: showMaterial ?? true,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ boq })
  } catch (err: any) {
    console.error('PUT /api/boq/[id] error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
