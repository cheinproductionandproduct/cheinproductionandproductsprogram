import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { getPendingApprovals } from '@/lib/approvals/approval-service'

/**
 * GET /api/approvals - Get pending approvals for current user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const approvals = await getPendingApprovals(user.id, user.role)

    return NextResponse.json({ approvals })
  } catch (error) {
    console.error('Error fetching approvals:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
