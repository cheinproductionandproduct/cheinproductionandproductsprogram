import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { listDocumentsByJobId } from '@/lib/documents/document-service'

/**
 * GET /api/jobs/[id]/documents - List documents that use this job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: jobId } = await params
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Non-admins only see their own documents
    const createdById = user.role !== 'ADMIN' ? user.id : undefined

    const result = await listDocumentsByJobId(jobId, {
      page,
      limit,
      createdById,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching documents for job:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
