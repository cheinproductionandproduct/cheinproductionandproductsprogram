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
import { getDocumentListMoneyTotal } from '@/lib/documents/document-list-money'

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

  const getStatusMod = (status: DocumentStatus) => {
    const map: Record<DocumentStatus, string> = {
      DRAFT:     'doc-status-badge--draft',
      PENDING:   'doc-status-badge--pending',
      APPROVED:  'doc-status-badge--approved',
      CLEARED:   'doc-status-badge--cleared',
      REJECTED:  'doc-status-badge--rejected',
      CANCELLED: 'doc-status-badge--cancelled',
    }
    return map[status] || 'doc-status-badge--draft'
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

  /** Same rules as APR dashboard sum — see getDocumentListMoneyTotal */
  const getDocumentAmount = (doc: any) => getDocumentListMoneyTotal(doc?.data)

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
        <div className="list-cards">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="doc-card doc-card--skeleton">
              <div className="doc-card-top">
                <span className="skel skel--sm" />
                <div className="doc-card-badges">
                  <span className="skel skel--badge" />
                  <span className="skel skel--badge" />
                </div>
              </div>
              <span className="skel skel--lg" />
              <span className="skel skel--md" />
              <div className="doc-card-footer">
                <span className="skel skel--sm" />
                <span className="skel skel--amt" />
              </div>
            </div>
          ))}
        </div>
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
                {/* Top row: doc number + badges */}
                <div className="doc-card-top">
                  <span className="doc-card-number">{doc.documentNumber || '—'}</span>
                  <div className="doc-card-badges">
                    {doc.formTemplate?.slug === 'advance-payment-request' && (
                      <span className="doc-card-kind doc-card-kind--apr">ใบเบิก</span>
                    )}
                    {doc.formTemplate?.slug === 'advance-payment-clearance' && (
                      <span className="doc-card-kind doc-card-kind--apc">ใบเคลียร์</span>
                    )}
                    <span className={`doc-status-badge ${getStatusMod(doc.status)}`}>
                      {documentStatusLabelTh(doc.status)}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="doc-card-title">{doc.title}</h3>

                {/* Job */}
                {getJobDisplay(doc) && (
                  <p className="doc-card-job">งาน: {getJobDisplay(doc)}</p>
                )}

                {/* Footer: creator + date on left, amount on right */}
                <div className="doc-card-footer">
                  <span className="doc-card-creator">
                    {doc.creator?.fullName || doc.creator?.email} · {formatDateDMY(doc.createdAt)}
                  </span>
                  {getDocumentAmount(doc) != null && (
                    <span className="doc-card-amount-value">
                      {formatNumber(getDocumentAmount(doc)!)} <span className="doc-card-currency">บาท</span>
                    </span>
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
