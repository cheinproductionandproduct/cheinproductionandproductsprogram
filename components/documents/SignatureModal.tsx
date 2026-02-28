'use client'

import { useState, useRef, useEffect } from 'react'
import '@/app/dashboard/dashboard.css'

// Embedded signature canvas component
function EmbeddedSignatureCanvas({ onSignatureChange, initialSignature, onClear }: { onSignatureChange: (sig: string | null) => void; initialSignature: string | null; onClear?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(!!initialSignature)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = 600
    canvas.height = 200

    // Set drawing style
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Load existing signature if provided
    if (initialSignature) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setHasSignature(true)
      }
      img.src = initialSignature
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasSignature(false)
    }
  }, [initialSignature])

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)
    setHasSignature(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    // Update signature when drawing stops
    if (hasSignature) {
      const canvas = canvasRef.current
      if (canvas) {
        const signature = canvas.toDataURL('image/png')
        onSignatureChange(signature)
      }
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onSignatureChange(null)
    if (onClear) onClear()
  }

  // Expose clearCanvas function
  useEffect(() => {
    if (onClear) {
      (window as any).__clearSignature = clearCanvas
    }
  }, [onClear])

  return (
    <div style={{ border: '2px dashed #000', borderRadius: '6px', background: '#fff', padding: '8px' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{ 
          width: '100%', 
          height: '200px', 
          cursor: 'crosshair',
          touchAction: 'none',
          display: 'block'
        }}
      />
    </div>
  )
}

interface SignatureModalProps {
  approval: any
  onClose: () => void
}

export function SignatureModal({ approval, onClose }: SignatureModalProps) {
  const [signature, setSignature] = useState<string | null>(null)
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<any>(null)

  const handleClearSignature = () => {
    setSignature(null)
    setError(null)
  }

  const handleApprove = async () => {
    if (!signature) {
      setError('กรุณาบันทึกลายเซ็นก่อน (Please save signature first)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/approvals/${approval.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signatureData: signature,
          comments: comments.trim() || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to approve')
      }

      onClose()
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติ')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!comments.trim()) {
      setError('Please provide rejection comments')
      return
    }

    if (!confirm('Are you sure you want to reject this document?')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/approvals/${approval.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comments: comments.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to reject')
      }

      onClose()
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signature-modal-overlay">
      <div className="signature-modal-content">
        <div className="signature-modal-header">
          <h2 className="signature-modal-title">
            Review &amp; Approve Document
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="signature-modal-close-btn"
          >
            &times;
          </button>
        </div>

        <div className="signature-modal-body">
          <div className="signature-modal-instructions">
            <p className="signature-modal-instructions-text">
              <strong>Document:</strong> {approval.document?.title || 'Untitled'}
            </p>
            <p className="signature-modal-instructions-text">
              <strong>Step:</strong> {approval.workflowStep?.name || 'Unknown Step'}
            </p>
          </div>

          {error && (
            <div className="form-error-box">
              {error}
            </div>
          )}

          <div className="form-section" style={{ width: '100%', marginBottom: '16px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '2px solid #000' }}>
            <label className="form-label">
              Comments (Optional)
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="form-textarea"
              placeholder="Add any comments..."
            />
          </div>

          <div className="form-section" style={{ width: '100%', marginBottom: '16px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '2px solid #000' }}>
            <label className="form-label">
              Signature *
            </label>
            <EmbeddedSignatureCanvas
              onSignatureChange={(sig) => {
                setSignature(sig)
                setError(null)
              }}
              initialSignature={signature}
              onClear={handleClearSignature}
            />
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '16px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleClearSignature}
                className="form-button"
                style={{ background: '#fff', color: '#000' }}
              >
                ลบ (Clear)
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loading}
                  className="form-button"
                  style={{ background: '#fff', color: '#000' }}
                >
                  {loading ? 'กำลังประมวลผล...' : 'ปฏิเสธ (Reject)'}
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={loading || !signature}
                  className="form-button form-button-submit"
                >
                  {loading ? 'กำลังประมวลผล...' : 'อนุมัติและลงนาม (Approve & Sign)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
