import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { UserRole } from '@prisma/client'

/**
 * DELETE /api/jobs/[id] - Delete a job (Manager+ only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only ADMIN or MANAGER can delete jobs
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return NextResponse.json(
        { error: 'Forbidden: Only managers and admins can delete jobs' },
        { status: 403 }
      )
    }

    const jobId = params.id

    // Check if job exists
    const job = await (prisma as any).job.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Delete the job
    await (prisma as any).job.delete({
      where: { id: jobId },
    })

    return NextResponse.json({ success: true, message: 'Job deleted' }, { status: 200 })
  } catch (error: any) {
    console.error('Error deleting job:', error)
    const message = error?.message || 'Internal server error'
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { error: isDev ? message : 'Internal server error' },
      { status: 500 }
    )
  }
}
