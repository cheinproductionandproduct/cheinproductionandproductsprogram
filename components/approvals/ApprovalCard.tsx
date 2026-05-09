'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import '@/app/dashboard/dashboard.css'
import { formatDateDMY } from '@/lib/utils/date-format'

function SignatureCanvas({ onSignatureChange }: { onSignatureChange: (sig: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = 600
    canvas.height = 200
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasSignature(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    if (hasSignature && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onSignatureChange(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ border: '2px dashed #999', borderRadius: 6, background: '#fff', padding: 6 }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ width: '100%', height: 200, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
        />
      </div>
      <button type="button" onClick={clear} className="form-button" style={{ alignSelf: 'flex-start', background: '#fff', color: '#333' }}>
        ลบ (Clear)
      </button>
    </div>
  )
}

interface ApprovalCardProps {
  approval: any
  onUpdate: (approvalId: string) => void
}

export function ApprovalCard({ approval, onUpdate }: ApprovalCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [savedSig, setSavedSig] = useState<string | null | undefined>(undefined) // undefined = not yet loaded
  const [signature, setSignature] = useState<string | null>(null)
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Load saved signature when modal opens
  useEffect(() => {
    if (!showModal || savedSig !== undefined) return
    fetch('/api/users/me/signature')
      .then(r => r.json())
      .then(d => setSavedSig(d.signatureImage ?? null))
      .catch(() => setSavedSig(null))
  }, [showModal, savedSig])

  const closeModal = () => {
    setShowModal(false)
    setError(null)
    setSignature(null)
    setComments('')
  }

  const effectiveSig = savedSig || signature

  const handleApprove = async () => {
    if (!effectiveSig) { setError('กรุณาวาดลายเซ็นก่อนอนุมัติ'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/approvals/${approval.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: effectiveSig, comments: comments.trim() || undefined }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message || result.error || 'Failed to approve')
      onUpdate(approval.id)
      closeModal()
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
      closeModal()
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
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
              <button type="button" onClick={closeModal} className="signature-modal-close-btn">&times;</button>
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

              <div className="form-section" style={{ width: '100%' }}>
                <label className="form-label">ลายเซ็น *</label>
                {savedSig === undefined ? (
                  <p style={{ color: '#888', fontSize: 14 }}>กำลังโหลดลายเซ็น...</p>
                ) : savedSig ? (
                  <div>
                    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, background: '#fafafa', textAlign: 'center', marginBottom: 8 }}>
                      <img src={savedSig} alt="signature" style={{ maxHeight: 90, maxWidth: '100%' }} />
                    </div>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>ใช้ลายเซ็นที่บันทึกไว้ — หรือวาดใหม่ด้านล่าง</p>
                    <SignatureCanvas onSignatureChange={sig => { setSignature(sig); setError(null) }} />
                  </div>
                ) : (
                  <SignatureCanvas onSignatureChange={sig => { setSignature(sig); setError(null) }} />
                )}
              </div>

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
                  disabled={loading || !effectiveSig}
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
