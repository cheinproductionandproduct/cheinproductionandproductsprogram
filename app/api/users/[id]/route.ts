import { createClient } from '@/lib/supabase/server'
import { getUserById, updateUserProfile, updateUserRole } from '@/lib/auth/user-sync'
import { canManageUsers } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

/**
 * GET /api/users/[id] - Get user by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const user = await getUserById(id)

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Users can view their own profile, admins can view any
    const { getOrCreateUser } = await import('@/lib/auth/user-sync')
    const currentUser = await getOrCreateUser(supabaseUser)
    
    if (currentUser?.id !== id && !canManageUsers(currentUser?.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/users/[id] - Update user profile
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const { getOrCreateUser } = await import('@/lib/auth/user-sync')
    const currentUser = await getOrCreateUser(supabaseUser)

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { fullName, department, position, avatarUrl, role } = body

    // Users can update their own profile (except role), admins can update anyone
    if (currentUser.id !== id && !canManageUsers(currentUser.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Only admins can update roles
    if (role && role !== currentUser.role && !canManageUsers(currentUser.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only admins can update user roles' },
        { status: 403 }
      )
    }

    // Update profile
    const updateData: any = {}
    if (fullName !== undefined) updateData.fullName = fullName
    if (department !== undefined) updateData.department = department
    if (position !== undefined) updateData.position = position
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl

    let updatedUser
    if (Object.keys(updateData).length > 0) {
      updatedUser = await updateUserProfile(id, updateData)
    }

    // Update role if provided and user is admin
    if (role && canManageUsers(currentUser.role)) {
      updatedUser = await updateUserRole(id, role as UserRole)
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
