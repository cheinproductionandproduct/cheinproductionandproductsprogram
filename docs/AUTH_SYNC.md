# Authentication & User Sync Documentation

## Overview

This system automatically syncs Supabase Auth users with the Prisma User model, ensuring that every authenticated user has a corresponding record in your database with extended profile information.

## How It Works

### Automatic Sync

1. **Middleware Auto-Sync**: When a user makes any request, the middleware automatically syncs their Supabase Auth user to Prisma if they're authenticated.

2. **API Route Sync**: The `/api/auth/sync-user` endpoint can be called to manually sync a user.

3. **Client-Side Hook**: The `useUser()` hook automatically syncs the user when used in React components.

### User Data Flow

```
Supabase Auth (auth.users)
    ↓
Auto-sync on login/request
    ↓
Prisma User (users table)
    ↓
Extended profile (role, department, etc.)
```

## API Endpoints

### Sync User
```typescript
POST /api/auth/sync-user
// Syncs current authenticated user from Supabase to Prisma
// Returns: { success: true, user: User, created: boolean }

GET /api/auth/sync-user
// Gets current user (syncs if needed)
// Returns: { user: User }
```

### User Management
```typescript
GET /api/users
// List all users (admin only)
// Query params: ?page=1&limit=20&role=ADMIN&isActive=true

GET /api/users/[id]
// Get user by ID
// Users can view their own profile, admins can view any

PATCH /api/users/[id]
// Update user profile
// Body: { fullName?, department?, position?, avatarUrl?, role? }
// Note: Only admins can update roles
```

## Usage Examples

### Server-Side (API Routes)

```typescript
import { getCurrentUser, requireAuth, requireAdmin } from '@/lib/auth/middleware-helpers'

// Get current user (returns null if not authenticated)
const user = await getCurrentUser()

// Require authentication (throws if not authenticated)
const user = await requireAuth()

// Require admin role
const admin = await requireAdmin()
```

### Client-Side (React Components)

```typescript
'use client'
import { useUser } from '@/hooks/use-user'

export function MyComponent() {
  const { user, loading, error } = useUser()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!user) return <div>Not authenticated</div>

  return <div>Welcome, {user.fullName}!</div>
}
```

### Route Protection

```typescript
import { protectRoute, withAuth } from '@/lib/auth/route-protection'

// Option 1: Manual protection
export async function GET(request: NextRequest) {
  const { user, error } = await protectRoute(request, {
    requireAuth: true,
    requireRole: UserRole.ADMIN,
  })

  if (error) return error
  // user is guaranteed to be authenticated and have ADMIN role
}

// Option 2: Wrapper function
export const GET = withAuth(
  async (request, { user }) => {
    // user is authenticated
    return NextResponse.json({ data: 'protected data' })
  },
  { requireAuth: true, requireAdmin: true }
)
```

### Permission Checks

```typescript
import { 
  hasRole, 
  hasAnyRole, 
  isAdmin, 
  canApprove,
  canManageUsers 
} from '@/lib/auth/permissions'

// Check specific role
if (hasRole(user.role, UserRole.ADMIN)) {
  // User is admin or higher
}

// Check multiple roles
if (hasAnyRole(user.role, [UserRole.MANAGER, UserRole.ADMIN])) {
  // User is manager or admin
}

// Check if user can approve documents
if (canApprove(user.role)) {
  // User can approve (ADMIN, MANAGER, or APPROVER)
}
```

## User Roles

The system supports 4 roles with hierarchical permissions:

1. **EMPLOYEE** (default)
   - Can create documents
   - Can edit/delete own draft documents

2. **APPROVER**
   - All Employee permissions
   - Can approve documents

3. **MANAGER**
   - All Approver permissions
   - Can manage team documents

4. **ADMIN**
   - All permissions
   - Can manage users
   - Can edit/delete any document
   - Can update user roles

## Syncing Existing Users

If you have existing Supabase Auth users that need to be synced:

1. **Automatic**: They'll be synced on their next login/request
2. **Manual**: Call `/api/auth/sync-user` for each user
3. **Bulk**: Create a script to sync all users at once

## User Metadata

Supabase Auth user metadata is automatically synced:
- `full_name` or `name` → `fullName`
- `avatar_url` or `picture` → `avatarUrl`
- `department` → `department`
- `position` → `position`
- `role` → `role` (if provided)

## Security Notes

- User sync happens automatically but doesn't expose sensitive data
- Role updates require admin permissions
- Users can only update their own profile (except role)
- All API routes validate authentication and permissions
