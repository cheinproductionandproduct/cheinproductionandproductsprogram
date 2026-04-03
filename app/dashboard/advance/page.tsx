'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * APR summary and "create new" have moved to the เอกสาร page (/documents).
 * Redirect so old links still work.
 */
export default function AdvanceDashboardPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/documents')
  }, [router])
  return (
    <div className="list-page">
      <div className="list-loading">กำลังไปหน้าเอกสาร...</div>
    </div>
  )
}
