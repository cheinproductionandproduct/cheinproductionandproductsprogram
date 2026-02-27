import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { canManageUsers } from '@/lib/auth/permissions'
import { syncAllUsersFromSupabase } from '@/lib/auth/user-sync'
import { NextResponse } from 'next/server'

/**
 * POST /api/users/sync - Sync all Supabase Auth users into the Prisma User table.
 * Admin only. Requires SUPABASE_SERVICE_ROLE_KEY in .env.
 */
export async function POST() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canManageUsers(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only admins can sync users.' },
        { status: 403 }
      )
    }

    const result = await syncAllUsersFromSupabase()

    return NextResponse.json({
      message: 'User table updated from Supabase.',
      ...result,
    })
  } catch (error: any) {
    console.error('Error syncing users:', error)
    const message =
      error?.message || 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
