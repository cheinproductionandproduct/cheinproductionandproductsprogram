'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/hooks/use-user'
import '../dashboard.css'

function DrawPad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 560
    canvas.height = 200
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pt = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pt(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasStroke(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pt(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stop = () => setIsDrawing(false)

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  const save = () => {
    if (!hasStroke || !canvasRef.current) return
    onSave(canvasRef.current.toDataURL('image/png'))
    clear()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ border: '2px dashed #999', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}
          style={{ width: '100%', height: 200, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="form-button" style={{ background: '#fff', color: '#333' }} onClick={clear}>
          ลบ (Clear)
        </button>
        <button
          type="button"
          className="form-button form-button-submit"
          onClick={save}
          disabled={!hasStroke}
        >
          บันทึกลายเซ็น
        </button>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useUser()
  const [savedSig, setSavedSig] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/users/me/signature')
      .then(r => r.json())
      .then(d => { setSavedSig(d.signatureImage ?? null) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const persist = async (dataUrl: string | null) => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/users/me/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureImage: dataUrl }),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      setSavedSig(dataUrl)
      setMsg({ type: 'ok', text: dataUrl ? 'บันทึกลายเซ็นเรียบร้อยแล้ว' : 'ลบลายเซ็นแล้ว' })
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => persist(ev.target?.result as string)
    reader.readAsDataURL(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">โปรไฟล์ / ลายเซ็น</h1>
        <p className="page-subtitle">{user?.fullName || user?.email}</p>
      </header>

      <section className="list-content">
        <div className="list-panel" style={{ maxWidth: 640 }}>
          <h2 className="form-section-title" style={{ marginBottom: 8 }}>ลายเซ็นของฉัน</h2>
          <p className="form-hint" style={{ marginBottom: 20 }} lang="th">
            ลายเซ็นนี้จะถูกใช้อัตโนมัติเมื่อคุณกด <strong>อนุมัติ</strong> เอกสาร
          </p>

          {loading ? (
            <div className="list-loading">โหลด...</div>
          ) : (
            <>
              {/* Current saved signature */}
              {savedSig && (
                <div style={{ marginBottom: 24 }}>
                  <p className="form-label" style={{ marginBottom: 8 }}>ลายเซ็นที่บันทึกอยู่</p>
                  <div style={{
                    border: '1px solid #ddd', borderRadius: 8, padding: 12,
                    background: '#fafafa', display: 'inline-block', marginBottom: 12,
                  }}>
                    <img src={savedSig} alt="saved signature" style={{ maxHeight: 100, maxWidth: 400, display: 'block' }} />
                  </div>
                  <div>
                    <button
                      type="button"
                      className="form-button"
                      style={{ background: '#fff', color: '#c00', border: '1px solid #c00' }}
                      onClick={() => persist(null)}
                      disabled={saving}
                    >
                      ลบลายเซ็น
                    </button>
                  </div>
                </div>
              )}

              {/* Mode tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setMode('draw')}
                  style={{
                    padding: '6px 18px', borderRadius: 6, fontSize: 14, cursor: 'pointer',
                    background: mode === 'draw' ? '#1F3864' : '#fff',
                    color: mode === 'draw' ? '#fff' : '#333',
                    border: '1px solid #1F3864',
                  }}
                >
                  วาดลายเซ็น
                </button>
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  style={{
                    padding: '6px 18px', borderRadius: 6, fontSize: 14, cursor: 'pointer',
                    background: mode === 'upload' ? '#1F3864' : '#fff',
                    color: mode === 'upload' ? '#fff' : '#333',
                    border: '1px solid #1F3864',
                  }}
                >
                  อัปโหลดรูป
                </button>
              </div>

              {mode === 'draw' && (
                <DrawPad onSave={dataUrl => persist(dataUrl)} />
              )}

              {mode === 'upload' && (
                <div>
                  <button
                    type="button"
                    className="form-button"
                    onClick={() => fileRef.current?.click()}
                    disabled={saving}
                  >
                    เลือกไฟล์รูปภาพ (PNG / JPG)
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    style={{ display: 'none' }}
                    onChange={onFile}
                  />
                </div>
              )}

              {msg && (
                <div style={{
                  padding: '10px 14px', borderRadius: 6, marginTop: 16,
                  background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${msg.type === 'ok' ? '#16a34a' : '#dc2626'}`,
                  color: msg.type === 'ok' ? '#166534' : '#b91c1c',
                  fontSize: 14,
                }}>
                  {msg.text}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
