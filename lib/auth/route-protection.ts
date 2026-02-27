import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from './middleware-helpers'
import { hasRole, hasAnyRole, canManageUsers } from './permissions'
import { UserRole } from '@prisma/client'

export type RouteProtectionOptions = {
  requireAuth?: boolean
  requireRole?: UserRole
  requireAnyRole?: UserRole[]
  requireAdmin?: boolean
  redirectTo?: string
}

/**
 * Protects an API route with authentication and role checks
 * Use this in API route handlers
 */
export async function protectRoute(
  request: NextRequest,
  options: RouteProtectionOptions = {}
): Promise<{ user: any; error: NextResponse | null }> {
  const {
    requireAuth = true,
    requireRole,
    requireAnyRole,
    requireAdmin = false,
    redirectTo = '/login',
  } = options

  // Get current user
  const user = await getCurrentUser()

  // Check authentication
  if (requireAuth && !user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      ),
    }
  }

  // Check admin requirement
  if (requireAdmin && !canManageUsers(user?.role)) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      ),
    }
  }

  // Check specific role requirement
  if (requireRole && user && !hasRole(user.role, requireRole)) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Forbidden', message: `${requireRole} role required` },
        { status: 403 }
      ),
    }
  }

  // Check any role requirement
  if (requireAnyRole && user && !hasAnyRole(user.role, requireAnyRole)) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions' },
        { status: 403 }
      ),
    }
  }

  return { user, error: null }
}

/**
 * Wrapper for API route handlers with protection
 */
export function withAuth(
  handler: (request: NextRequest, context: { user: any }) => Promise<NextResponse>,
  options: RouteProtectionOptions = {}
) {
  return async (request: NextRequest, context?: any) => {
    const { user, error } = await protectRoute(request, options)
    
    if (error) {
      return error
    }

    return handler(request, { ...context, user })
  }
}
