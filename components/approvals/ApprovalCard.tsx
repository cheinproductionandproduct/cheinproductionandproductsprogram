'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import '@/app/dashboard/dashboard.css'
import { formatDateDMY } from '@/lib/utils/date-format'

interface ApprovalCardProps {
  approval: any
  onUpdate: (approvalId: string) => void
}

export function ApprovalCard({ approval, onUpdate }: ApprovalCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [savedSig, setSavedSig] = useState<string | null>(null)
  const [sigLoading, setSigLoading] = useState(false)
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Load saved signature when modal opens
  useEffect(() => {
    if (!showModal) return
    setSigLoading(true)
    fetch('/api/users/me/signature')
      .then(r => r.json())
      .then(d => setSavedSig(d.signatureImage ?? null))
      .catch(() => setSavedSig(null))
      .finally(() => setSigLoading(false))
  }, [showModal])

  const handleApprove = async () => {
    if (!savedSig) {
      setError('ยังไม่มีลายเซ็น — กรุณาอัปโหลดลายเซ็นในหน้าโปรไฟล์ก่อน')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/approvals/${approval.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: savedSig, comments: comments.trim() || undefined }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message || result.error || 'Failed to approve')
      onUpdate(approval.id)
      setShowModal(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติ')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!comments.trim()) { setError('กรุณาระบุเหตุผลการปฏิเสธ'); return }
    if (!confirm('ยืนยันการปฏิเสธเอกสารนี้?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/approvals/${approval.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments: comments.trim() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message || 'Failed to reject')
      onUpdate(approval.id)
      setShowModal(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setError(null)
    setComments('')
    setSavedSig(null)
  }

  return (
    <>
      <div className="doc-card doc-card--pending">
        <div className="doc-card-top">
          <span className="doc-card-number">{approval.document.documentNumber || '—'}</span>
          <span className="doc-status-badge doc-status-badge--pending">
            ขั้น {approval.workflowStep.stepNumber}: {approval.workflowStep.name}
          </span>
        </div>

        <h3 className="doc-card-title">{approval.document.title}</h3>
        <p className="doc-card-job">{approval.document.formTemplate.name}</p>

        <div className="doc-card-footer">
          <span className="doc-card-creator">
            {approval.document.creator.fullName || approval.document.creator.email}
            {' · '}
            {formatDateDMY(approval.document.createdAt)}
            {approval.workflowStep.description && <> · {approval.workflowStep.description}</>}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href={`/documents/${approval.documentId}`} className="approval-card-cta">
              ดูเอกสาร →
            </Link>
            <button
              type="button"
              className="form-button form-button-submit"
              style={{ padding: '6px 16px', fontSize: 14 }}
              onClick={() => setShowModal(true)}
            >
              อนุมัติ / ปฏิเสธ
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="signature-modal-overlay">
          <div className="signature-modal-content">
            <div className="signature-modal-header">
              <h2 className="signature-modal-title">อนุมัติเอกสาร</h2>
              <button type="button" onClick={closeModal} className="signature-modal-close-btn">
                &times;
              </button>
            </div>

            <div className="signature-modal-body">
              <div className="signature-modal-instructions">
                <p className="signature-modal-instructions-text">
                  <strong>เอกสาร:</strong> {approval.document.title}
                </p>
                <p className="signature-modal-instructions-text">
                  <strong>ขั้นตอน:</strong> {approval.workflowStep.name}
                </p>
                <Link href={`/documents/${approval.documentId}`} target="_blank" className="list-empty-link">
                  ดูเอกสารฉบับเต็ม →
                </Link>
              </div>

              {error && <div className="form-error-box">{error}</div>}

              {/* Signature preview */}
              <div className="form-section" style={{ width: '100%' }}>
                <label className="form-label">ลายเซ็น</label>
                {sigLoading ? (
                  <p style={{ color: '#888', fontSize: 14 }}>กำลังโหลดลายเซ็น...</p>
                ) : savedSig ? (
                  <div style={{
                    border: '1px solid #ddd', borderRadius: 8, padding: 12,
                    background: '#fafafa', textAlign: 'center',
                  }}>
                    <img src={savedSig} alt="signature" style={{ maxHeight: 100, maxWidth: '100%' }} />
                    <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                      ลายเซ็นที่บันทึกไว้ — จะถูกวางในเอกสารเมื่ออนุมัติ
                    </p>
                  </div>
                ) : (
                  <div style={{
                    padding: '16px', borderRadius: 8, background: '#fffbeb',
                    border: '1px solid #f59e0b', color: '#92400e', fontSize: 14,
                  }}>
                    ยังไม่มีลายเซ็นที่บันทึกไว้ —{' '}
                    <Link href="/dashboard/profile" style={{ color: '#1976d2' }}>
                      อัปโหลดลายเซ็นในหน้าโปรไฟล์
                    </Link>
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="form-section" style={{ width: '100%', marginBottom: 0 }}>
                <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  rows={3}
                  className="form-textarea"
                  placeholder="เพิ่มหมายเหตุ..."
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loading}
                  className="form-button"
                  style={{ background: '#fff', color: '#000' }}
                >
                  {loading ? 'กำลังประมวลผล...' : 'ปฏิเสธ'}
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={loading || !savedSig}
                  className="form-button form-button-submit"
                >
                  {loading ? 'กำลังอนุมัติ...' : 'อนุมัติและลงนาม'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
