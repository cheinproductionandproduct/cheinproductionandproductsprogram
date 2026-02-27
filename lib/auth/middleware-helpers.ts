import { createClient } from '@/lib/supabase/server'
import { getOrCreateUser } from '@/lib/auth/user-sync'
import { UserRole } from '@prisma/client'

/**
 * Get current authenticated user from Supabase and Prisma
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  try {
    const supabase = await createClient()
    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser()

    if (!supabaseUser) {
      return null
    }

    const user = await getOrCreateUser(supabaseUser)
    return user
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Require authentication - throws error if user not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized: Authentication required')
  }
  return user
}

/**
 * Require specific role - throws error if user doesn't have required role
 */
export async function requireRole(requiredRole: UserRole) {
  const user = await requireAuth()
  
  const { hasRole } = await import('@/lib/auth/permissions')
  if (!hasRole(user.role, requiredRole)) {
    throw new Error(`Forbidden: ${requiredRole} role required`)
  }
  
  return user
}

/**
 * Require admin role
 */
export async function requireAdmin() {
  return await requireRole(UserRole.ADMIN)
}
