'use client'

import React, { Suspense, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useUser } from '@/hooks/use-user'
import { formatNumber } from '@/lib/utils/thai-number'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'

const DocumentList = dynamic(
  () => import('@/components/documents/DocumentList').then((m) => ({ default: m.DocumentList })),
  { loading: () => <div className="list-loading">โหลดรายการ...</div>, ssr: false }
)

function DocumentsPageContent() {
  const { user, loading: userLoading } = useUser()
  const [viewMode, setViewMode] = useState<'pending' | 'approved'>('pending')
  const [aprSummary, setAprSummary] = useState<{ totalAmount: number; documentCount: number; aprTemplateId: string } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    async function loadAprSummary() {
      try {
        const tRes = await fetch('/api/form-templates', { credentials: 'include' })
        if (!tRes.ok || cancelled) return
        const { templates } = await tRes.json()
        const apr = templates?.find((t: any) => t.slug === 'advance-payment-request')
        if (!apr?.id || cancelled) return
        const params = new URLSearchParams({
          formTemplateId: apr.id,
          limit: '100',
          sortBy: 'createdAt',
          sortOrder: 'desc',
          createdById: user.id,
        })
        const dRes = await fetch(`/api/documents?${params}`, { credentials: 'include' })
        if (!dRes.ok || cancelled) return
        const { documents } = await dRes.json()
        const list = Array.isArray(documents) ? documents : []
        let sum = 0
        for (const doc of list) {
          const d = doc?.data
          if (d && typeof d === 'object') {
            if (typeof d.totalAmount === 'number' && !Number.isNaN(d.totalAmount)) sum += d.totalAmount
            else if (d.items?.total != null && !Number.isNaN(Number(d.items.total))) sum += Number(d.items.total)
          }
        }
        if (!cancelled) setAprSummary({ totalAmount: sum, documentCount: list.length, aprTemplateId: apr.id })
      } catch {
        // ignore
      }
    }
    loadAprSummary()
    return () => { cancelled = true }
  }, [user?.id])

  // For "รออนุมัติ" view, show all statuses by default.
  // For "อนุมัติแล้ว" view, include APPROVED and CLEARED (APC) so completed APC appear.
  const statusFilter = viewMode === 'pending' ? '' : 'APPROVED,CLEARED'

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">เอกสาร</h1>
        <p className="page-subtitle" lang="th">
          สลับระหว่างเอกสารรออนุมัติและเอกสารที่อนุมัติแล้ว
        </p>
      </header>

      <div className="doc-view-toggle" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`doc-view-toggle-btn ${viewMode === 'pending' ? 'doc-view-toggle-btn--active' : ''}`}
          onClick={() => setViewMode('pending')}
        >
          รออนุมัติ
        </button>
        <button
          type="button"
          className={`doc-view-toggle-btn ${viewMode === 'approved' ? 'doc-view-toggle-btn--active' : ''}`}
          onClick={() => setViewMode('approved')}
        >
          อนุมัติแล้ว
        </button>
      </div>

      {aprSummary && (
        <div className="apr-summary-inline" style={{ marginBottom: 24 }}>
          <div className="apr-dashboard-card apr-dashboard-card--total" style={{ maxWidth: 400 }}>
            <div className="apr-dashboard-card-label">จำนวนเงินที่ขอเบิกแล้วทั้งหมด (ใบเบิกเงินทดรองจ่าย)</div>
            <div className="apr-dashboard-card-value">
              {formatNumber(aprSummary.totalAmount)} <span className="apr-dashboard-unit">บาท</span>
            </div>
            <div className="apr-dashboard-card-meta">จากเอกสาร {aprSummary.documentCount} รายการ</div>
            <Link
              href="/dashboard/advance/new"
              className="form-button form-button-submit"
              style={{ marginTop: 12, display: 'inline-block' }}
            >
              สร้างใบเบิกใหม่
            </Link>
          </div>
        </div>
      )}

      <section className="list-content">
        <DocumentList
          key={viewMode}
          initialPage={1}
          initialStatus={statusFilter}
        />
      </section>
    </div>
  )
}

export default function DocumentsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="list-page"><div className="list-loading">โหลด...</div></div>}>
        <DocumentsPageContent />
      </Suspense>
    </DashboardLayout>
  )
}
