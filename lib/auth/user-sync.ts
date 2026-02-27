import { prisma } from '@/lib/prisma'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { UserRole } from '@prisma/client'

/**
 * Syncs a Supabase Auth user with the Prisma User model
 * Creates the user if they don't exist, updates if they do
 */
export async function syncUserFromSupabase(
  supabaseUser: SupabaseUser
): Promise<{ user: any; created: boolean }> {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    })

    if (existingUser) {
      // Get role from Supabase user_metadata, validate it, or keep existing
      const supabaseRole = supabaseUser.user_metadata?.role
      let role = existingUser.role
      
      // Validate and update role from Supabase if provided
      if (supabaseRole && Object.values(UserRole).includes(supabaseRole as UserRole)) {
        role = supabaseRole as UserRole
      }

      // Update existing user with latest info from Supabase Auth
      const updatedUser = await prisma.user.update({
        where: { id: supabaseUser.id },
        data: {
          email: supabaseUser.email || existingUser.email,
          // Update metadata if available
          fullName: supabaseUser.user_metadata?.full_name || 
                   supabaseUser.user_metadata?.name || 
                   existingUser.fullName,
          avatarUrl: supabaseUser.user_metadata?.avatar_url || 
                    supabaseUser.user_metadata?.picture || 
                    existingUser.avatarUrl,
          // Sync role from Supabase user_metadata
          role: role,
          // Sync department and position from Supabase
          department: supabaseUser.user_metadata?.department || existingUser.department,
          position: supabaseUser.user_metadata?.position || existingUser.position,
        },
      })

      return { user: updatedUser, created: false }
    } else {
      // Get role from Supabase user_metadata, validate it, or default to EMPLOYEE
      const supabaseRole = supabaseUser.user_metadata?.role
      let role: UserRole = UserRole.EMPLOYEE
      
      // Validate role from Supabase if provided
      if (supabaseRole && Object.values(UserRole).includes(supabaseRole as UserRole)) {
        role = supabaseRole as UserRole
      }

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          fullName: supabaseUser.user_metadata?.full_name || 
                   supabaseUser.user_metadata?.name || 
                   null,
          avatarUrl: supabaseUser.user_metadata?.avatar_url || 
                    supabaseUser.user_metadata?.picture || 
                    null,
          role: role,
          department: supabaseUser.user_metadata?.department || null,
          position: supabaseUser.user_metadata?.position || null,
          isActive: true,
        },
      })

      return { user: newUser, created: true }
    }
  } catch (error) {
    console.error('Error syncing user from Supabase:', error)
    throw error
  }
}

/**
 * Gets or creates a user from Supabase Auth
 * Useful for ensuring user exists in Prisma before operations
 */
export async function getOrCreateUser(
  supabaseUser: SupabaseUser | null
): Promise<any | null> {
  if (!supabaseUser) {
    return null
  }

  const { user } = await syncUserFromSupabase(supabaseUser)
  return user
}

/**
 * Updates user role (admin only operation)
 */
export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<any> {
  return await prisma.user.update({
    where: { id: userId },
    data: { role },
  })
}

/**
 * Updates user profile information
 */
export async function updateUserProfile(
  userId: string,
  data: {
    fullName?: string
    department?: string
    position?: string
    avatarUrl?: string
  }
): Promise<any> {
  return await prisma.user.update({
    where: { id: userId },
    data,
  })
}

/**
 * Gets user by ID with all relations
 */
export async function getUserById(userId: string) {
  return await prisma.user.findUnique({
    where: { id: userId },
    include: {
      createdDocuments: {
        take: 5,
        orderBy: { createdAt: 'desc' },
      },
      approvals: {
        take: 5,
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

/**
 * Sync all users from Supabase Auth into the Prisma User table.
 * Uses Supabase Admin API (requires SUPABASE_SERVICE_ROLE_KEY).
 * Creates new users and updates existing ones (email, fullName, role, department, position from user_metadata).
 */
export async function syncAllUsersFromSupabase(): Promise<{
  synced: number
  created: number
  updated: number
  errors: { email?: string; error: string }[]
}> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  const results = { synced: 0, created: 0, updated: 0, errors: [] as { email?: string; error: string }[] }

  let page = 1
  const perPage = 100
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })

    if (error) {
      results.errors.push({ error: error.message })
      break
    }

    const users = data?.users ?? []
    if (users.length === 0) break

    for (const u of users) {
      try {
        const { created } = await syncUserFromSupabase(u)
        results.synced++
        if (created) results.created++
        else results.updated++
      } catch (err: any) {
        results.errors.push({ email: u.email, error: err?.message || String(err) })
      }
    }

    hasMore = users.length === perPage
    page++
  }

  return results
}

/**
 * Get users by IDs (lightweight, for resolving assignee names).
 * Returns only id, email, fullName.
 */
export async function getUsersByIds(ids: string[]) {
  if (ids.length === 0) return []
  const unique = [...new Set(ids)]
  return prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, fullName: true },
  })
}

/**
 * Gets all users with pagination
 */
export async function getUsers(options?: {
  page?: number
  limit?: number
  role?: UserRole
  isActive?: boolean
  ids?: string[]
}) {
  const page = options?.page || 1
  const limit = options?.limit || 20
  const skip = (page - 1) * limit

  const where: any = {}
  if (options?.role) where.role = options.role
  if (options?.isActive !== undefined) where.isActive = options.isActive
  if (options?.ids?.length) where.id = { in: options.ids }

  const users = await prisma.user.findMany({
    where,
    ...(options?.ids?.length ? {} : { skip, take: limit }),
    orderBy: { createdAt: 'desc' },
  })

  const total = options?.ids?.length ? users.length : await prisma.user.count({ where })

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: options?.ids?.length ? 1 : Math.ceil(total / limit),
    },
  }
}
