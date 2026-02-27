import { UserRole } from '@prisma/client'

/**
 * Permission levels hierarchy
 * Higher number = more permissions
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 4,
  MANAGER: 3,
  APPROVER: 2,
  EMPLOYEE: 1,
}

/**
 * Check if a user has a specific role
 */
export function hasRole(userRole: UserRole | null | undefined, requiredRole: UserRole): boolean {
  if (!userRole) return false
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Check if user has at least one of the required roles
 */
export function hasAnyRole(
  userRole: UserRole | null | undefined,
  requiredRoles: UserRole[]
): boolean {
  if (!userRole) return false
  return requiredRoles.some((role) => hasRole(userRole, role))
}

/**
 * Check if user is admin
 */
export function isAdmin(userRole: UserRole | null | undefined): boolean {
  return userRole === UserRole.ADMIN
}

/**
 * Check if user can approve documents
 */
export function canApprove(userRole: UserRole | null | undefined): boolean {
  return hasAnyRole(userRole, [UserRole.ADMIN, UserRole.MANAGER, UserRole.APPROVER])
}

/**
 * Check if user can manage users (admin only)
 */
export function canManageUsers(userRole: UserRole | null | undefined): boolean {
  return isAdmin(userRole)
}

/**
 * Check if user can create documents
 */
export function canCreateDocuments(userRole: UserRole | null | undefined): boolean {
  // All authenticated users can create documents
  return !!userRole
}

/**
 * Check if user can edit a document
 * Users can edit their own documents if status is DRAFT
 */
export function canEditDocument(
  userRole: UserRole | null | undefined,
  documentCreatorId: string,
  currentUserId: string,
  documentStatus: string
): boolean {
  if (!userRole) return false
  
  // Admin can edit any document
  if (isAdmin(userRole)) return true
  
  // Creator can edit their own draft documents
  if (documentCreatorId === currentUserId && documentStatus === 'DRAFT') {
    return true
  }
  
  return false
}

/**
 * Check if user can delete a document
 */
export function canDeleteDocument(
  userRole: UserRole | null | undefined,
  documentCreatorId: string,
  currentUserId: string,
  documentStatus: string
): boolean {
  if (!userRole) return false
  
  // Admin can delete any document
  if (isAdmin(userRole)) return true
  
  // Creator can delete their own draft documents
  if (documentCreatorId === currentUserId && documentStatus === 'DRAFT') {
    return true
  }
  
  return false
}

/**
 * Get user role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  const displayNames: Record<UserRole, string> = {
    ADMIN: 'Administrator',
    MANAGER: 'Manager',
    APPROVER: 'Approver',
    EMPLOYEE: 'Employee',
  }
  return displayNames[role] || role
}
