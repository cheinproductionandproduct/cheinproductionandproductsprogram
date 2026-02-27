'use client'

import React, { useCallback, useEffect, useState } from 'react'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'
import { ApprovalList } from '@/components/approvals/ApprovalList'

export default function SigningPage() {
  const [approvals, setApprovals] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchApprovals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/approvals')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to load approvals')
      setApprovals(data.approvals || [])
      setError(null)
    } catch (err: any) {
      console.error('Error loading approvals:', err)
      if (!silent) setError(err.message || 'Failed to load approvals')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">เอกสารรออนุมัติ</h1>
          <p className="page-subtitle" lang="th">
            เอกสารที่ส่งมาให้คุณลงนาม
          </p>
        </header>

        <section className="list-content">
          {loading && (
            <div className="list-loading">โหลด...</div>
          )}
          {error && !loading && (
            <div className="list-error" lang="th">
              {error}
            </div>
          )}
          {!loading && !error && approvals && (
            <ApprovalList
              initialApprovals={approvals}
              onRefresh={() => fetchApprovals(true)}
            />
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

