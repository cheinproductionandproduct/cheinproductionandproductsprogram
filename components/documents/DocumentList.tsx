'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DocumentStatus } from '@prisma/client'
import { useUser } from '@/hooks/use-user'
import '@/app/dashboard/dashboard.css'
import { formatDateDMY } from '@/lib/utils/date-format'
import { documentStatusLabelTh } from '@/lib/utils/document-status-label'
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
  const { loading: userLoading } = useUser()
  const [documents, setDocuments] = useState<any[]>([])
  const [formTemplates, setFormTemplates] = useState<any[]>([])
  const [jobs, setJobs] = useState<{ id: string; name: string; code: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(initialPage)
  const [status, setStatus] = useState(initialStatus || '')
  /** Sent to API only — never APR/APC ids (those use client-side advanceKindFilter). */
  const [otherFormTemplateId, setOtherFormTemplateId] = useState('')
  /** ใบเบิก / ใบเคลียร์ quick filter — no extra fetch when toggling. */
  const [advanceKindFilter, setAdvanceKindFilter] = useState<'all' | 'apr' | 'apc'>('all')
  const [search, setSearch] = useState(initialSearch || '')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  const initialTemplateApplied = useRef(false)

  useEffect(() => {
    fetchFormTemplates()
  }, [])

  const fetchFormTemplates = async () => {
    try {
      const [tRes, jRes] = await Promise.all([
        fetch('/api/form-templates', { credentials: 'include' }),
        fetch('/api/jobs', { credentials: 'include' }),
      ])
      const tData = await tRes.json()
      const jData = await jRes.json()
      setFormTemplates(tData.templates || [])
      setJobs(jData.jobs || [])
    } catch (error) {
      console.error('Error fetching form templates:', error)
    }
  }

  // Map initialFormTemplateId → advance kind vs server template once templates are known
  useEffect(() => {
    if (initialTemplateApplied.current || !formTemplates.length || !initialFormTemplateId) return
    initialTemplateApplied.current = true
    const apr = formTemplates.find((t: any) => t.slug === 'advance-payment-request')
    const apc = formTemplates.find((t: any) => t.slug === 'advance-payment-clearance')
    if (apr && initialFormTemplateId === apr.id) {
      setAdvanceKindFilter('apr')
      setOtherFormTemplateId('')
    } else if (apc && initialFormTemplateId === apc.id) {
      setAdvanceKindFilter('apc')
      setOtherFormTemplateId('')
    } else {
      setOtherFormTemplateId(initialFormTemplateId)
    }
  }, [formTemplates, initialFormTemplateId])

  useEffect(() => {
    if (userLoading) return
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams({
      page: page.toString(),
      ...(status && { status }),
      ...(otherFormTemplateId && { formTemplateId: otherFormTemplateId }),
      ...(search && { search }),
    })

    fetch(`/api/documents?${params}`, { credentials: 'include' })
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
  }, [page, status, otherFormTemplateId, search, userLoading])

  const aprTemplate = useMemo(
    () => formTemplates.find((t: any) => t.slug === 'advance-payment-request'),
    [formTemplates]
  )
  const apcTemplate = useMemo(
    () => formTemplates.find((t: any) => t.slug === 'advance-payment-clearance'),
    [formTemplates]
  )

  const filteredDocuments = useMemo(() => {
    if (advanceKindFilter === 'all') return documents
    if (advanceKindFilter === 'apr') {
      return documents.filter((d: any) => d.formTemplate?.slug === 'advance-payment-request')
    }
    return documents.filter((d: any) => d.formTemplate?.slug === 'advance-payment-clearance')
  }, [documents, advanceKindFilter])

  const templateSelectValue = useMemo(() => {
    if (otherFormTemplateId) return otherFormTemplateId
    if (advanceKindFilter === 'apr' && aprTemplate) return aprTemplate.id
    if (advanceKindFilter === 'apc' && apcTemplate) return apcTemplate.id
    return ''
  }, [otherFormTemplateId, advanceKindFilter, aprTemplate, apcTemplate])

  const onFormTemplateSelect = (id: string) => {
    setPage(1)
    if (!id) {
      setAdvanceKindFilter('all')
      setOtherFormTemplateId('')
      return
    }
    if (aprTemplate && id === aprTemplate.id) {
      setAdvanceKindFilter('apr')
      setOtherFormTemplateId('')
      return
    }
    if (apcTemplate && id === apcTemplate.id) {
      setAdvanceKindFilter('apc')
      setOtherFormTemplateId('')
      return
    }
    setAdvanceKindFilter('all')
    setOtherFormTemplateId(id)
  }

  const getStatusBadge = (status: DocumentStatus) => {
    const badges: Record<DocumentStatus, string> = {
      DRAFT: 'bg-white text-black border border-black',
      PENDING: 'bg-white text-black border border-black',
      APPROVED: 'bg-white text-black border border-black',
      CLEARED: 'bg-white text-black border border-black',
      REJECTED: 'bg-white text-black border border-black',
      CANCELLED: 'bg-white text-black border border-black',
    }
    return badges[status] || badges.DRAFT
  }

  const getJobDisplay = (doc: any): string | null => {
    const d = doc?.data
    if (d?.jobName) return d.jobCode ? `${d.jobCode} — ${d.jobName}` : d.jobName
    if (d?.jobId && jobs.length) {
      const job = jobs.find((j) => j.id === d.jobId)
      return job ? (job.code ? `${job.code} — ${job.name}` : job.name) : null
    }
    return null
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
        {(aprTemplate || apcTemplate) && (
          <div className="doc-list-advance-type" lang="th">
            <span className="doc-list-advance-type-label">ประเภทเอกสารเงินทดรอง</span>
            <div className="doc-list-advance-type-btns">
              <button
                type="button"
                className={`doc-list-type-btn ${advanceKindFilter === 'all' ? 'doc-list-type-btn--active' : ''}`}
                onClick={() => {
                  setAdvanceKindFilter('all')
                  setOtherFormTemplateId('')
                  setPage(1)
                }}
              >
                ทั้งหมด
              </button>
              {aprTemplate && (
                <button
                  type="button"
                  className={`doc-list-type-btn ${advanceKindFilter === 'apr' ? 'doc-list-type-btn--active' : ''}`}
                  onClick={() => {
                    setAdvanceKindFilter('apr')
                    setOtherFormTemplateId('')
                    setPage(1)
                  }}
                  title={aprTemplate.name}
                >
                  ใบเบิก
                </button>
              )}
              {apcTemplate && (
                <button
                  type="button"
                  className={`doc-list-type-btn ${advanceKindFilter === 'apc' ? 'doc-list-type-btn--active' : ''}`}
                  onClick={() => {
                    setAdvanceKindFilter('apc')
                    setOtherFormTemplateId('')
                    setPage(1)
                  }}
                  title={apcTemplate.name}
                >
                  ใบเคลียร์
                </button>
              )}
            </div>
          </div>
        )}
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
              <option value="APPROVED,CLEARED">อนุมัติแล้ว + เคลียร์แล้ว (ใบเคลียร์)</option>
              <option value="APPROVED">อนุมัติแล้ว</option>
              <option value="CLEARED">เคลียร์แล้ว (ใบเคลียร์)</option>
              <option value="REJECTED">ถูกปฏิเสธ</option>
              <option value="CANCELLED">ยกเลิกแล้ว</option>
            </select>
          </div>

          <div className="list-filter-field">
            <label className="list-filter-label">ประเภทฟอร์ม (ทุกประเภท)</label>
            <select
              value={templateSelectValue}
              onChange={(e) => onFormTemplateSelect(e.target.value)}
              className="list-select"
            >
              <option value="">ทุกฟอร์ม</option>
              {formTemplates.map((template: any) => (
                <option key={template.id} value={template.id}>
                  {template.slug === 'advance-payment-request'
                    ? `${template.name} (ใบเบิก)`
                    : template.slug === 'advance-payment-clearance'
                      ? `${template.name} (ใบเคลียร์)`
                      : template.name}
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
                setAdvanceKindFilter('all')
                setOtherFormTemplateId('')
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
      ) : filteredDocuments.length === 0 ? (
        <div className="list-empty">
          <p className="list-empty-text" lang="th">
            ไม่มีเอกสารประเภทนี้ในหน้านี้ — ลองเลือก &quot;ทั้งหมด&quot; หรือเปลี่ยนหน้า
          </p>
        </div>
      ) : (
        <>
          <div className="list-cards">
            {filteredDocuments.map((doc: any) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="doc-card"
              >
                <div className="doc-card-main">
                  <div className="doc-card-title-row">
                    <h3 className="doc-card-title">{doc.title}</h3>
                    {doc.formTemplate?.slug === 'advance-payment-request' && (
                      <span className="doc-card-kind doc-card-kind--apr" title="ใบเบิกเงินทดรองจ่าย">
                        ใบเบิก
                      </span>
                    )}
                    {doc.formTemplate?.slug === 'advance-payment-clearance' && (
                      <span className="doc-card-kind doc-card-kind--apc" title="ใบเคลียร์เงินทดรองจ่าย">
                        ใบเคลียร์
                      </span>
                    )}
                    <span className={`doc-status-badge ${getStatusBadge(doc.status)}`}>
                      {documentStatusLabelTh(doc.status)}
                    </span>
                  </div>
                  <p className="doc-card-meta">
                    {doc.formTemplate?.name} • {doc.documentNumber || 'No number'}
                  </p>
                  {getJobDisplay(doc) && (
                    <p className="doc-card-job">
                      งาน: {getJobDisplay(doc)}
                    </p>
                  )}
                  <p className="doc-card-meta">
                    Created by {doc.creator?.fullName || doc.creator?.email} •{' '}
                    {formatDateDMY(doc.createdAt)}
                  </p>
                  {getDocumentAmount(doc) != null && (
                    <p className="doc-card-amount">
                      <span className="doc-card-amount-label">จำนวนเงินรวม</span>{' '}
                      <span className="doc-card-amount-value">{formatNumber(getDocumentAmount(doc)!)} บาท</span>
                    </p>
                  )}
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
