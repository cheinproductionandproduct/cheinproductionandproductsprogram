'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DocumentStatus } from '@prisma/client'
import '@/app/dashboard/dashboard.css'
import { formatDateDMY } from '@/lib/utils/date-format'
import { formatNumber } from '@/lib/utils/thai-number'

interface DocumentListProps {
  initialPage?: number
  initialStatus?: string
  initialFormTemplateId?: string
  initialSearch?: string
}

export function DocumentList({
  initialPage = 1,
  initialStatus,
  initialFormTemplateId,
  initialSearch,
}: DocumentListProps) {
  const router = useRouter()
  const [documents, setDocuments] = useState<any[]>([])
  const [formTemplates, setFormTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(initialPage)
  const [status, setStatus] = useState(initialStatus || '')
  const [formTemplateId, setFormTemplateId] = useState(initialFormTemplateId || '')
  const [search, setSearch] = useState(initialSearch || '')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  useEffect(() => {
    fetchFormTemplates()
  }, [])

  const fetchFormTemplates = async () => {
    try {
      const res = await fetch('/api/form-templates')
      const data = await res.json()
      setFormTemplates(data.templates || [])
    } catch (error) {
      console.error('Error fetching form templates:', error)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams({
      page: page.toString(),
      ...(status && { status }),
      ...(formTemplateId && { formTemplateId }),
      ...(search && { search }),
    })

    fetch(`/api/documents?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.documents) setDocuments(data.documents)
        if (data.pagination) setPagination(data.pagination)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Error fetching documents:', error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [page, status, formTemplateId, search])

  const getStatusBadge = (status: DocumentStatus) => {
    const badges: Record<DocumentStatus, string> = {
      DRAFT: 'bg-white text-black border border-black',
      PENDING: 'bg-white text-black border border-black',
      APPROVED: 'bg-white text-black border border-black',
      REJECTED: 'bg-white text-black border border-black',
      CANCELLED: 'bg-white text-black border border-black',
    }
    return badges[status] || badges.DRAFT
  }

  /** Get total amount from document data (APR: totalAmount/items.total, APC: totalExpenses/advanceAmount) */
  const getDocumentAmount = (doc: any): number | null => {
    const d = doc?.data
    if (!d || typeof d !== 'object') return null
    if (typeof d.totalAmount === 'number' && !Number.isNaN(d.totalAmount)) return d.totalAmount
    if (d.items && typeof d.items.total === 'number' && !Number.isNaN(d.items.total)) return d.items.total
    if (typeof d.totalExpenses === 'number' && !Number.isNaN(d.totalExpenses)) return d.totalExpenses
    if (typeof d.advanceAmount === 'number' && !Number.isNaN(d.advanceAmount)) return d.advanceAmount
    return null
  }

  return (
    <div className="list-panel">
      {/* Filters */}
      <div className="list-filters">
        <div className="list-filters-grid">
          <div className="list-filter-field">
            <label className="list-filter-label">ค้นหา</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="ค้นหาเอกสาร..."
              className="list-input"
            />
          </div>

          <div className="list-filter-field">
            <label className="list-filter-label">สถานะเอกสาร</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="list-select"
            >
              <option value="">ทุกสถานะ</option>
              <option value="DRAFT">ฉบับร่าง</option>
              <option value="PENDING">รอดำเนินการ</option>
              <option value="APPROVED">อนุมัติแล้ว</option>
              <option value="REJECTED">ถูกปฏิเสธ</option>
              <option value="CANCELLED">ยกเลิกแล้ว</option>
            </select>
          </div>

          <div className="list-filter-field">
            <label className="list-filter-label">ประเภทฟอร์ม</label>
            <select
              value={formTemplateId}
              onChange={(e) => {
                setFormTemplateId(e.target.value)
                setPage(1)
              }}
              className="list-select"
            >
              <option value="">ทุกฟอร์ม</option>
              {formTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div className="list-filter-actions">
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setStatus('')
                setFormTemplateId('')
                setPage(1)
              }}
              className="form-button list-clear-btn"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="list-loading">โหลด...</div>
      ) : documents.length === 0 ? (
        <div className="list-empty">
          <p className="list-empty-text">ไม่พบเอกสาร</p>
          <Link href="/documents/new" className="list-empty-link">
            สร้างเอกสารแรกของคุณ
          </Link>
        </div>
      ) : (
        <>
          <div className="list-cards">
            {documents.map((doc: any) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="doc-card"
              >
                <div className="doc-card-main">
                  <div className="doc-card-title-row">
                    <h3 className="doc-card-title">{doc.title}</h3>
                    <span className={`doc-status-badge ${getStatusBadge(doc.status)}`}>
                      {doc.status}
                    </span>
                  </div>
                  <p className="doc-card-meta">
                    {doc.formTemplate.name} • {doc.documentNumber || 'No number'}
                  </p>
                  <p className="doc-card-meta">
                    Created by {doc.creator.fullName || doc.creator.email} •{' '}
                    {formatDateDMY(doc.createdAt)}
                  </p>
                  {getDocumentAmount(doc) != null && (
                    <p className="doc-card-meta doc-card-amount">
                      <span className="doc-card-amount-label">จำนวนเงินรวม</span>{' '}
                      <span className="doc-card-amount-value">{formatNumber(getDocumentAmount(doc)!)} บาท</span>
                    </p>
                  )}
                </div>
                <div className="doc-card-side">
                  <p className="doc-card-stat">
                    {doc._count.approvals} approvals
                  </p>
                  <p className="doc-card-stat">
                    {doc._count.attachments} attachments
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="list-pagination">
              <p className="list-pagination-text">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="list-pagination-buttons">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="form-button list-page-btn"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page === pagination.totalPages}
                  className="form-button list-page-btn"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
