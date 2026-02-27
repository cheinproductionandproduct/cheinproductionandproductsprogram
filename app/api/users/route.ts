import { createClient } from '@/lib/supabase/server'
import { getUsers, getUserById } from '@/lib/auth/user-sync'
import { canManageUsers } from '@/lib/auth/permissions'
import { NextResponse } from 'next/server'

/**
 * GET /api/users - List all users (admin only)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user: supabaseUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !supabaseUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user from Prisma to check role
    const { getOrCreateUser } = await import('@/lib/auth/user-sync')
    const user = await getOrCreateUser(supabaseUser)

    // For user assignment, allow all authenticated users to see other users
    // But limit the fields returned for non-admins
    const isAdmin = user && canManageUsers(user.role)

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const role = searchParams.get('role') as any
    const isActive = searchParams.get('isActive')
      ? searchParams.get('isActive') === 'true'
      : undefined
    const idsParam = searchParams.get('ids')
    const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined

    const result = await getUsers({
      page,
      limit,
      role,
      isActive,
      ...(ids?.length ? { ids } : {}),
    })

    // For non-admins, only return basic user info (id, email, fullName, role)
    if (!isAdmin) {
      result.users = result.users.map((u: any) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
      })) as any
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
