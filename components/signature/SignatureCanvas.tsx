'use client'

import { useRef, useState, useEffect } from 'react'

interface SignatureCanvasProps {
  isOpen: boolean
  onClose: () => void
  onSave: (signature: string) => void
  label: string
}

export function SignatureCanvas({ isOpen, onClose, onSave, label }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size - responsive but with max dimensions
    const maxWidth = 800
    const maxHeight = 400
    const containerWidth = Math.min(window.innerWidth * 0.9, maxWidth)
    const containerHeight = Math.min(window.innerHeight * 0.5, maxHeight)
    
    canvas.width = containerWidth
    canvas.height = containerHeight

    // Set drawing style
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    // Clear canvas when opening
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }, [isOpen])

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
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    if (!hasSignature) {
      alert('กรุณาลายเซ็นก่อนบันทึก (Please sign before saving)')
      return
    }
    
    const signature = canvas.toDataURL('image/png')
    onSave(signature)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="signature-modal-overlay" onClick={onClose}>
      <div className="signature-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="signature-modal-header">
          <h2 className="signature-modal-title">ลายเซ็น: {label}</h2>
          <button
            onClick={onClose}
            className="signature-modal-close"
            type="button"
          >
            ×
          </button>
        </div>

        {/* Instructions */}
        <div className="signature-modal-instructions">
          <p>กรุณาลายเซ็นในช่องด้านล่าง (Please sign in the box below)</p>
        </div>

        {/* Canvas Container */}
        <div className="signature-canvas-container">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="signature-canvas"
            style={{ touchAction: 'none' }}
          />
        </div>

        {/* Action Buttons */}
        <div className="signature-modal-actions">
          <button
            onClick={clearCanvas}
            className="signature-btn signature-btn-clear"
            type="button"
          >
            ลบ (Clear)
          </button>
          <button
            onClick={saveSignature}
            className="signature-btn signature-btn-save"
            type="button"
            disabled={!hasSignature}
          >
            บันทึก (Save)
          </button>
        </div>
      </div>
    </div>
  )
}
