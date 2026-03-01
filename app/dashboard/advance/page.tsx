'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatNumber } from '@/lib/utils/thai-number'
import '../dashboard.css'

export default function AdvanceDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [totalAmount, setTotalAmount] = useState<number>(0)
  const [documentCount, setDocumentCount] = useState(0)
  const [recentDocs, setRecentDocs] = useState<any[]>([])
  const [aprTemplateId, setAprTemplateId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/form-templates')
        if (cancelled) return
        if (!res.ok) throw new Error('Failed to load templates')
        const { templates } = await res.json()
        const aprTemplate = templates?.find((t: any) => t.slug === 'advance-payment-request')
        if (!aprTemplate) {
          setTotalAmount(0)
          setDocumentCount(0)
          setRecentDocs([])
          return
        }
        setAprTemplateId(aprTemplate.id)
        const docRes = await fetch(
          `/api/documents?formTemplateId=${encodeURIComponent(aprTemplate.id)}&limit=500&sortBy=createdAt&sortOrder=desc`
        )
        if (cancelled) return
        if (!docRes.ok) throw new Error('Failed to load documents')
        const { documents } = await docRes.json()
        const list = Array.isArray(documents) ? documents : []
        setDocumentCount(list.length)
        let sum = 0
        for (const doc of list) {
          const d = doc?.data
          if (d && typeof d === 'object') {
            if (typeof d.totalAmount === 'number' && !Number.isNaN(d.totalAmount)) sum += d.totalAmount
            else if (d.items && typeof d.items.total === 'number' && !Number.isNaN(d.items.total)) sum += d.items.total
          }
        }
        setTotalAmount(sum)
        setRecentDocs(list.slice(0, 10))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'โหลดไม่สำเร็จ')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="list-page">
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="list-page">
        <div className="list-error">{error}</div>
        <Link href="/dashboard" className="form-button" style={{ marginTop: 12 }}>กลับไปแดชบอร์ด</Link>
      </div>
    )
  }

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">ใบเบิกเงินทดรองจ่าย (APR)</h1>
        <p className="page-subtitle" lang="th">
          สรุปจำนวนเงินที่คุณขอเบิกแล้ว และรายการเอกสาร
        </p>
      </header>

      <div className="apr-dashboard-summary">
        <div className="apr-dashboard-card apr-dashboard-card--total">
          <div className="apr-dashboard-card-label">จำนวนเงินที่ขอเบิกแล้วทั้งหมด</div>
          <div className="apr-dashboard-card-value">{formatNumber(totalAmount)} <span className="apr-dashboard-unit">บาท</span></div>
          <div className="apr-dashboard-card-meta">จากเอกสาร {documentCount} รายการ</div>
        </div>
        <Link href="/dashboard/advance/new" className="apr-dashboard-card apr-dashboard-card--action">
          <span className="apr-dashboard-card-action-label">สร้างใบเบิกใหม่</span>
          <span className="apr-dashboard-card-action-hint">+ เพิ่มรายการเบิกเงินทดรองจ่าย</span>
        </Link>
      </div>

      {recentDocs.length > 0 && (
        <section className="list-content" style={{ marginTop: 24 }}>
          <h2 className="form-section-title" style={{ marginBottom: 12 }}>รายการเอกสารล่าสุด</h2>
          <div className="list-panel">
            <ul className="apr-dashboard-doc-list">
              {recentDocs.map((doc: any) => {
                const amt = typeof doc?.data?.totalAmount === 'number' ? doc.data.totalAmount : doc?.data?.items?.total
                const amountStr = typeof amt === 'number' && !Number.isNaN(amt) ? formatNumber(amt) + ' บาท' : '—'
                return (
                  <li key={doc.id} className="apr-dashboard-doc-item">
                    <Link href={`/documents/${doc.id}`} className="apr-dashboard-doc-link">
                      <span className="apr-dashboard-doc-number">{doc.documentNumber || doc.id}</span>
                      <span className="apr-dashboard-doc-amount">{amountStr}</span>
                      <span className="apr-dashboard-doc-status">{doc.status}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {aprTemplateId && (
              <p className="form-hint" style={{ marginTop: 12 }}>
                <Link href={`/documents?formTemplateId=${encodeURIComponent(aprTemplateId)}`}>ดูรายการเอกสารทั้งหมด →</Link>
              </p>
            )}
          </div>
        </section>
      )}

      {documentCount === 0 && (
        <div className="list-panel" style={{ marginTop: 24 }}>
          <div className="list-empty">
            <p className="list-empty-text">ยังไม่มีใบเบิกเงินทดรองจ่าย</p>
            <Link href="/dashboard/advance/new" className="form-button form-button-submit" style={{ marginTop: 12 }}>
              สร้างใบเบิกแรก
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
