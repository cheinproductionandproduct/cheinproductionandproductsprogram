import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { approveDocumentStep } from '@/lib/approvals/approval-service'
import { canApprove } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'

/**
 * POST /api/approvals/[id]/approve - Approve a document step
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

    // Check if user has permission to approve documents
    // Only ADMIN, MANAGER, and APPROVER can sign documents (not EMPLOYEE)
    if (!canApprove(user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only managers and approvers can sign documents' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { signatureData, comments } = body

    if (!signatureData) {
      return NextResponse.json(
        { error: 'Signature is required' },
        { status: 400 }
      )
    }

    const approval = await approveDocumentStep(
      id,
      user.id,
      signatureData,
      comments
    )

    return NextResponse.json({ approval, success: true })
  } catch (error: any) {
    console.error('Error approving document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
