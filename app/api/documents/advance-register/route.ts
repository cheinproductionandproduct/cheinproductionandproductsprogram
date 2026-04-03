import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { getAdvanceRegister } from '@/lib/documents/document-service'

/**
 * GET /api/documents/advance-register
 * List APPROVED APR documents with clearance status (ทะเบียน).
 * Employee: only their own APRs. Manager/Approver/Admin: all APRs.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')

    const createdById = user.role === 'EMPLOYEE' ? user.id : undefined
    const result = await getAdvanceRegister({ page, limit, createdById })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching advance register:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
