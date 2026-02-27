import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { rejectDocumentStep } from '@/lib/approvals/approval-service'

/**
 * POST /api/approvals/[id]/reject - Reject a document step
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { comments } = body

    if (!comments || comments.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection comments are required' },
        { status: 400 }
      )
    }

    const approval = await rejectDocumentStep(id, user.id, comments)

    return NextResponse.json({ approval, success: true })
  } catch (error: any) {
    console.error('Error rejecting document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
