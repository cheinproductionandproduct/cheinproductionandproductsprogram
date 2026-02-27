import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client with service role key - for server-side admin only.
 * Use only in API routes or server code. Never expose this key to the client.
 * Used for listing all users (auth.admin.listUsers) to sync to Prisma.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL. ' +
        'Add SUPABASE_SERVICE_ROLE_KEY to .env (from Supabase Dashboard → Settings → API → service_role).'
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
