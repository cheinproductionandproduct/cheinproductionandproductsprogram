import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { getAdvanceRegister } from '@/lib/documents/document-service'
import { canApprove } from '@/lib/auth/permissions'

/**
 * GET /api/documents/advance-register
 * List APR (advance payment request) documents with clearance status.
 * Manager/Approver/Admin only - for ทะเบียนคุมลูกหนี้เงินทดรองและติดตามทวงถาม
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canApprove(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only managers and approvers can view the advance register' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')

    const result = await getAdvanceRegister({ page, limit })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching advance register:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
