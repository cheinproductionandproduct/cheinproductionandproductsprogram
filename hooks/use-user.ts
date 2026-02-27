'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef, useState } from 'react'
import type { User } from '@prisma/client'

// Cache so that when component remounts (e.g. after tab switch) we show user immediately
let cachedUser: User | null = null

// Throttle: avoid hitting Prisma on every tab focus (Supabase fires onAuthStateChange when tab is focused)
const SYNC_THROTTLE_MS = 60_000
let lastSyncAt = 0
let syncInProgress = false

/**
 * React hook to get current user
 * Auto-syncs user from Supabase Auth to Prisma
 * Uses cache so remount (tab switch) does not show loading again.
 * Skips sync when tab is hidden, throttles sync, and never runs more than one sync at a time.
 */
export function useUser() {
  const [user, setUser] = useState<User | null>(() => cachedUser)
  const [loading, setLoading] = useState(() => (cachedUser === null))
  const [error, setError] = useState<Error | null>(null)
  const initialLoadDone = useRef(!!cachedUser)

  useEffect(() => {
    async function fetchUser(silent = false) {
      if (syncInProgress) return
      syncInProgress = true
      try {
        if (!silent) setLoading(true)
        const supabase = createClient()
        
        const {
          data: { user: supabaseUser },
        } = await supabase.auth.getUser()

        if (!supabaseUser) {
          cachedUser = null
          setUser(null)
          if (!silent) setLoading(false)
          initialLoadDone.current = true
          return
        }

        const syncResponse = await fetch('/api/auth/sync-user', {
          method: 'POST',
        })

        if (!syncResponse.ok) {
          const errorData = await syncResponse.json().catch(() => ({}))
          const message = errorData.message || 'Failed to sync user'
          // 401 / not authenticated: treat as logged out, don't throw
          if (syncResponse.status === 401 || message === 'User not authenticated') {
            cachedUser = null
            setUser(null)
            setError(null)
            if (!silent) setLoading(false)
            initialLoadDone.current = true
            return
          }
          console.error('Sync user error:', errorData)
          throw new Error(message)
        }

        const responseData = await syncResponse.json()
        if (responseData.user) {
          cachedUser = responseData.user
          setUser(responseData.user)
          lastSyncAt = Date.now()
        } else {
          console.error('No user in sync response:', responseData)
          throw new Error('User data not returned from sync')
        }
      } catch (err) {
        console.error('Error in useUser hook:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        syncInProgress = false
        if (!silent) setLoading(false)
        initialLoadDone.current = true
      }
    }

    fetchUser()

    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (typeof window !== 'undefined' && window.document.visibilityState !== 'visible') return
      if (syncInProgress) return
      const now = Date.now()
      if (initialLoadDone.current && now - lastSyncAt < SYNC_THROTTLE_MS) return
      if (initialLoadDone.current) fetchUser(true)
      else fetchUser()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading, error }
}
