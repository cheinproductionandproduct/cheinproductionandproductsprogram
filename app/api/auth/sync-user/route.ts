import { createClient } from '@/lib/supabase/server'
import { syncUserFromSupabase } from '@/lib/auth/user-sync'
import { NextResponse } from 'next/server'

/**
 * API route to sync current user from Supabase Auth to Prisma
 * Call this after login or when user data needs to be synced
 */
export async function POST() {
  try {
    const supabase = await createClient()
    
    const {
      data: { user: supabaseUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !supabaseUser) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'User not authenticated' },
        { status: 401 }
      )
    }

    const { user, created } = await syncUserFromSupabase(supabaseUser)

    return NextResponse.json({
      success: true,
      user,
      created,
      message: created ? 'User created and synced' : 'User synced',
    })
  } catch (error) {
    console.error('Error syncing user:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to sync user' },
      { status: 500 }
    )
  }
}

/**
 * GET current user from Prisma (after sync)
 */
export async function GET() {
  try {
    const supabase = await createClient()
    
    const {
      data: { user: supabaseUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !supabaseUser) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'User not authenticated' },
        { status: 401 }
      )
    }

    const { user } = await syncUserFromSupabase(supabaseUser)

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error getting user:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get user' },
      { status: 500 }
    )
  }
}
