'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../dashboard/layout'
import '../../dashboard/dashboard.css'
import { useUser } from '@/hooks/use-user'
import { formatDateDMY } from '@/lib/utils/date-format'
import { PrintableDocumentForm } from '@/components/documents/PrintableDocumentForm'
import { SignatureModal } from '@/components/documents/SignatureModal'
import { getCachedDocument, setCachedDocument, clearCachedDocument } from '@/lib/documents/document-cache'

function mergeSignaturesFromApprovals(doc: any) {
  const formSlug = doc.formTemplate?.slug || ''
  const isADC = formSlug === 'advance-payment-clearance'
  if (!doc.approvals?.length) return

  const d = doc.data as any
  const sigs = d.signatures || {}
  let changed = false

  for (const a of doc.approvals) {
    if (a.status !== 'APPROVED' || !a.signatureData) continue
    const step = a.workflowStep?.stepNumber

    if (step === 1 && !sigs.approverSignature) {
      sigs.approverSignature = a.signatureData
      if (a.approver) d.approverSignatureName = a.approver.fullName || a.approver.email
      if (a.approvedAt) d.approverSignatureDate = new Date(a.approvedAt).toISOString().split('T')[0]
      changed = true
    } else if (step === 2) {
      const field = isADC ? 'financeManagerSignature' : 'payerSignature'
      if (!sigs[field]) {
        sigs[field] = a.signatureData
        if (a.approver) d[`${field}Name`] = a.approver.fullName || a.approver.email
        if (a.approvedAt) d[`${field}Date`] = new Date(a.approvedAt).toISOString().split('T')[0]
        changed = true
      }
    }
  }

  if (changed) {
    d.signatures = sigs
    doc.data = d
  }
}

async function resolveAssignedUsers(doc: any): Promise<Record<string, any>> {
  const ua = (doc.data as any)?.userAssignments || {}
  const ids = [ua.approver, ua.payer, ua.recipient].filter(Boolean)
  if (ids.length === 0) return {}

  try {
    const res = await fetch(`/api/users?ids=${ids.join(',')}`)
    const json = await res.json()
    if (!res.ok || !json.users) return {}

    const map: Record<string, any> = {}
    for (const u of json.users) map[u.id] = u

    const out: Record<string, any> = {}
    for (const role of ['approver', 'payer', 'recipient'] as const) {
      if (ua[role] && map[ua[role]]) {
        out[role] = { id: map[ua[role]].id, fullName: map[ua[role]].fullName, email: map[ua[role]].email }
      }
    }
    return out
  } catch {
    return {}
  }
}

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { user: currentUser, loading: userLoading } = useUser()

  const cached = id ? getCachedDocument(id) : undefined
  const [doc, setDoc] = useState<any>(cached?.document ?? null)
  const [assignedUsers, setAssignedUsers] = useState<Record<string, any>>(cached?.assignedUsers ?? {})
  const [loading, setLoading] = useState(!cached?.document)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const didFetch = useRef(false)
  const lastFetchedId = useRef<string | null>(null)
  const printWrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id) return

    const cachedForId = getCachedDocument(id)
    if (cachedForId?.document) {
      setDoc(cachedForId.document)
      setAssignedUsers(cachedForId.assignedUsers ?? {})
      setLoading(false)
      setError(null)
      lastFetchedId.current = id
      return
    }

    if (doc?.id !== id) {
      setDoc(null)
      setAssignedUsers({})
      setLoading(true)
      setError(null)
      didFetch.current = false
    }

    if (didFetch.current && lastFetchedId.current === id) return
    didFetch.current = true
    lastFetchedId.current = id
    setLoading(true)
    setError(null)

    let stale = false
    fetch(`/api/documents/${id}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, body: j })))
      .then(async ({ ok, status, body }) => {
        if (stale) return
        if (!ok) {
          const msg =
            status === 401 ? 'กรุณาเข้าสู่ระบบใหม่ (Session หมดอายุ)'
            : status === 403 ? 'คุณไม่มีสิทธิ์ดูเอกสารนี้'
            : body.error || body.message || 'โหลดเอกสารไม่สำเร็จ'
          throw new Error(msg)
        }

        const d = body.document
        mergeSignaturesFromApprovals(d)
        setDoc(d)
        setCachedDocument(id, d)
        setLoading(false)
        setError(null)

        const users = await resolveAssignedUsers(d)
        if (!stale && Object.keys(users).length > 0) {
          setAssignedUsers(users)
          setCachedDocument(id, d, users)
        }
      })
      .catch((err) => {
        if (stale) return
        console.error('Error fetching document:', err)
        setError(err?.message || 'โหลดเอกสารไม่สำเร็จ')
        setLoading(false)
        didFetch.current = false
        if (lastFetchedId.current === id) lastFetchedId.current = null
      })

    return () => { stale = true }
  }, [id])

  const handleSubmit = async () => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการส่งเอกสารนี้เพื่อให้ผู้ที่ได้รับมอบหมายลงนาม?')) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/documents/${id}/submit`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to submit')

      const refresh = await fetch(`/api/documents/${id}`)
      const refreshData = await refresh.json()
      if (refresh.ok) {
        setDoc(refreshData.document)
        setCachedDocument(id, refreshData.document, assignedUsers)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit document')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบเอกสารนี้? การกระทำนี้ไม่สามารถยกเลิกได้')) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to delete')
      clearCachedDocument(id)
      router.push('/documents')
    } catch (err: any) {
      alert(err.message || 'Failed to delete document')
      setDeleting(false)
    }
  }

  const handleSaveAsPdf = async () => {
    const wrapper = printWrapperRef.current
    if (!wrapper) {
      alert('ไม่พบพื้นที่เอกสารสำหรับสร้าง PDF')
      return
    }
    setExportingPdf(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      const imgW = canvas.width
      const imgH = canvas.height
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      // canvas at scale 2 → 1 canvas px = 0.5 CSS px
      const pxToMm = (25.4 / 96) / 2
      const imgWmm = imgW * pxToMm
      const imgHmm = imgH * pxToMm
      const scale = pageW / imgWmm
      const scaledH = imgHmm * scale
      // Avoid extra blank page from small overflow (rounding or extra wrapper space)
      const numPages = scaledH <= pageH + 2 ? 1 : Math.ceil(scaledH / pageH)

      const dataUrl = canvas.toDataURL('image/png')
      for (let i = 0; i < numPages; i++) {
        if (i > 0) pdf.addPage()
        pdf.addImage(dataUrl, 'PNG', 0, -i * pageH, pageW, scaledH)
      }

      const filename = (doc?.documentNumber || id).toString().replace(/\.pdf$/i, '') + '.pdf'
      pdf.save(filename)
    } catch (e: any) {
      alert(e?.message || 'ไม่สามารถบันทึก PDF ได้')
    } finally {
      setExportingPdf(false)
    }
  }

  // Find if current user has a pending approval
  const pendingApproval = currentUser && doc?.approvals?.find(
    (approval: any) => 
      approval.status === 'PENDING' && 
      approval.approverId === currentUser.id
  )
  
  // Debug logging
  useEffect(() => {
    if (currentUser && doc?.approvals) {
      console.log('[DocumentDetailPage] Current user ID:', currentUser.id)
      console.log('[DocumentDetailPage] All approvals:', doc.approvals)
      console.log('[DocumentDetailPage] Pending approval found:', pendingApproval)
    }
  }, [currentUser, doc?.approvals, pendingApproval])

  if (userLoading || loading) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-loading">โหลด...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    const isAuth = error.includes('เข้าสู่ระบบ') || error.includes('Session') || error.includes('สิทธิ์')
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-error">{error}</div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {isAuth && (
              <Link href="/login" className="form-button" style={{ background: '#16a34a', color: '#fff' }}>
                เข้าสู่ระบบ
              </Link>
            )}
            <button onClick={() => router.push('/documents')} className="form-button">
              กลับไปยังรายการเอกสาร
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!doc) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-error">ไม่พบเอกสาร</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="list-page doc-view-page">
        <header className="list-header doc-view-top-bar">
          <h1 className="page-title">{doc.title}</h1>
          <p className="page-subtitle">
            สถานะ: {doc.status} • สร้างเมื่อ: {formatDateDMY(doc.createdAt)}
          </p>
          <div className="doc-actions-nav no-print">
            <button onClick={() => router.push('/documents')} className="doc-nav-link">
              ← กลับไปยังรายการเอกสาร
            </button>
            <button onClick={() => router.push('/dashboard')} className="doc-nav-link">
              ← กลับไปยังแดชบอร์ด
            </button>
          </div>
        </header>

        <div className="doc-actions no-print">
          {/* All action buttons on one row */}
          <div className="doc-actions-row">
            {doc.status === 'DRAFT' && doc.createdById === currentUser?.id && (
              <button onClick={handleSubmit} disabled={submitting} className="doc-btn-primary">
                {submitting ? 'กำลังส่ง...' : 'ส่งเพื่อให้ลงนาม'}
              </button>
            )}
            {doc.status === 'DRAFT' && doc.createdById === currentUser?.id && (
              <button onClick={handleDelete} disabled={deleting} className="doc-btn-destructive">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                {deleting ? 'กำลังลบ...' : 'ลบเอกสาร'}
              </button>
            )}
            {doc.status === 'DRAFT' && doc.createdById === currentUser?.id && (
              <button onClick={() => router.push(`/documents/${id}/edit`)} className="doc-btn-secondary">
                แก้ไขเอกสาร
              </button>
            )}
            {doc.formTemplate?.slug === 'advance-payment-request' &&
              doc.status === 'APPROVED' &&
              doc.createdById === currentUser?.id && (
                <Link href={`/dashboard/advance-clearance?from=${doc.id}`} className="doc-btn-secondary">
                  สร้างใบเคลียร์เงินทดรองจ่าย (ADC)
                </Link>
              )}
            {pendingApproval && (
              <button
                type="button"
                onClick={() => setShowSignModal(true)}
                className="doc-btn-primary"
              >
                ลงนาม (Sign)
              </button>
            )}
            <button type="button" onClick={() => window.print()} className="doc-btn-secondary">
              พิมพ์
            </button>
            <button
              type="button"
              onClick={handleSaveAsPdf}
              disabled={exportingPdf}
              className="doc-btn-secondary"
              title="บันทึกเป็น PDF โดยใช้เลขที่เอกสารเป็นชื่อไฟล์"
            >
              {exportingPdf ? 'กำลังสร้าง PDF...' : 'บันทึกเป็น PDF'}
            </button>
          </div>
        </div>

        <section className="list-content">
          <div className="document-print-wrapper" ref={printWrapperRef}>
            <PrintableDocumentForm document={doc} assignedUsers={assignedUsers} />
          </div>
        </section>
        
        {/* Signature Modal for Signing */}
        {showSignModal && pendingApproval && (
          <SignatureModal
            approval={pendingApproval}
            onClose={() => {
              setShowSignModal(false)
              // Refresh the document after signing
              didFetch.current = false
              lastFetchedId.current = null
              setLoading(true)
              fetch(`/api/documents/${id}`)
                .then((r) => r.json())
                .then((data) => {
                  if (data.document) {
                    mergeSignaturesFromApprovals(data.document)
                    setDoc(data.document)
                    setCachedDocument(id, data.document, assignedUsers)
                  }
                  setLoading(false)
                })
                .catch((err) => {
                  console.error('Error refreshing document:', err)
                  setLoading(false)
                })
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
