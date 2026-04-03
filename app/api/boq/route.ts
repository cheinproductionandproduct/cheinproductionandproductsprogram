import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'

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

    if (jobId) {
      const boq = await (prisma as any).boqDocument.findUnique({
        where: { jobId },
      })
      return NextResponse.json({ boq: boq ?? null })
    }

    // List all BOQs with their job info
    const boqs = await (prisma as any).boqDocument.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { job: { select: { id: true, name: true, code: true } } },
    })
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

    const body = await request.json()
    const { jobId, data, showMaterial } = body
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    const boq = await (prisma as any).boqDocument.create({
      data: {
        jobId,
        data: data ?? [],
        showMaterial: showMaterial ?? true,
        createdById: user.id,
      },
    })

    return NextResponse.json({ boq }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/boq error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
