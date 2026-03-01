import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { approveDocumentStep, getPendingApprovals } from '@/lib/approvals/approval-service'
import { canApprove } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'

/**
 * POST /api/approvals/[id]/approve - Approve a document step.
 * One signature applies to all pending approvals for this user (same sign goes to all).
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

    const pendingList = await getPendingApprovals(user.id, user.role)
    if (!pendingList.some((a) => a.id === id)) {
      return NextResponse.json(
        { error: 'Approval not found or not pending for you' },
        { status: 400 }
      )
    }

    const approvedIds: string[] = []
    for (const a of pendingList) {
      try {
        await approveDocumentStep(a.id, user.id, signatureData, comments)
        approvedIds.push(a.id)
      } catch (e: any) {
        console.error('Error applying signature to approval', a.id, e.message)
      }
    }

    return NextResponse.json({
      approval: { id },
      approvedIds,
      success: true,
    })
  } catch (error: any) {
    console.error('Error approving document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
