'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/hooks/use-user'
import { useRouter } from 'next/navigation'
import '../dashboard.css'

const ALLOWED_EMAIL = 'kunanon2010th@gmail.com'

type UserSig = { id: string; fullName: string | null; email: string; signatureImage: string | null }

function SignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 500; canvas.height = 180
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  const pt = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
    const { x, y } = pt(e); ctx.beginPath(); ctx.moveTo(x, y)
    setIsDrawing(true); setHasStroke(true)
  }
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return; e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
    const { x, y } = pt(e); ctx.lineTo(x, y); ctx.stroke()
  }
  const stop = () => setIsDrawing(false)

  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  const save = () => {
    if (!hasStroke || !canvasRef.current) return
    onSave(canvasRef.current.toDataURL('image/png'))
    clear()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ border: '2px dashed #999', borderRadius: 6, background: '#fff' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}
          style={{ width: '100%', height: 180, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="form-button" style={{ background: '#fff', color: '#333' }} onClick={clear}>ลบ</button>
        <button type="button" className="form-button form-button-submit" onClick={save} disabled={!hasStroke}>บันทึกลายเซ็น</button>
      </div>
    </div>
  )
}

export default function AdminSignaturesPage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [users, setUsers] = useState<UserSig[]>([])
  const [loading, setLoading] = useState(true)
  const [msgs, setMsgs] = useState<Record<string, string>>({})
  const [drawingFor, setDrawingFor] = useState<string | null>(null)

  useEffect(() => {
    if (userLoading) return
    if (!user || user.email?.toLowerCase() !== ALLOWED_EMAIL) {
      router.replace('/dashboard'); return
    }
    // Load the 3 signers: bee, pc, tassanee
    fetch('/api/users?role=APPROVER,MANAGER')
      .then(r => r.json())
      .then(async d => {
        const all: UserSig[] = d.users ?? []
        // Fetch saved signature for each
        const withSigs = await Promise.all(
          all.map(async u => {
            try {
              const r = await fetch(`/api/admin/user-signature/${u.id}`)
              const j = await r.json()
              return { ...u, signatureImage: j.signatureImage ?? null }
            } catch { return { ...u, signatureImage: null } }
          })
        )
        setUsers(withSigs)
      })
      .finally(() => setLoading(false))
  }, [user, userLoading, router])

  const saveSignature = async (userId: string, dataUrl: string) => {
    try {
      const res = await fetch(`/api/admin/user-signature/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureImage: dataUrl }),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, signatureImage: dataUrl } : u))
      setMsgs(prev => ({ ...prev, [userId]: 'บันทึกแล้ว ✓' }))
      setDrawingFor(null)
    } catch (e: any) {
      setMsgs(prev => ({ ...prev, [userId]: e.message }))
    }
  }

  const deleteSignature = async (userId: string) => {
    if (!confirm('ลบลายเซ็นของผู้ใช้นี้?')) return
    await fetch(`/api/admin/user-signature/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureImage: null }),
    })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, signatureImage: null } : u))
    setMsgs(prev => ({ ...prev, [userId]: 'ลบแล้ว' }))
  }

  if (userLoading || loading) return <div className="list-page"><div className="list-loading">โหลด...</div></div>

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">จัดการลายเซ็น</h1>
        <p className="page-subtitle">วาดและบันทึกลายเซ็นสำหรับแต่ละผู้ลงนาม</p>
      </header>

      <section className="list-content">
        {users.map(u => (
          <div key={u.id} className="list-panel" style={{ maxWidth: 600, marginBottom: 24 }}>
            <h2 className="form-section-title" style={{ marginBottom: 4 }}>
              {u.fullName || u.email}
            </h2>
            <p className="form-hint" style={{ marginBottom: 16 }}>{u.email}</p>

            {u.signatureImage ? (
              <div style={{ marginBottom: 16 }}>
                <p className="form-label" style={{ marginBottom: 8 }}>ลายเซ็นที่บันทึกอยู่</p>
                <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, background: '#fafafa', display: 'inline-block' }}>
                  <img src={u.signatureImage} alt="signature" style={{ maxHeight: 80, maxWidth: 300, display: 'block' }} />
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button type="button" className="form-button" onClick={() => setDrawingFor(drawingFor === u.id ? null : u.id)}>
                    {drawingFor === u.id ? 'ยกเลิก' : 'วาดใหม่'}
                  </button>
                  <button type="button" className="form-button" style={{ color: '#c00', border: '1px solid #c00', background: '#fff' }} onClick={() => deleteSignature(u.id)}>
                    ลบ
                  </button>
                </div>
              </div>
            ) : (
              <p className="form-hint" style={{ marginBottom: 12 }}>ยังไม่มีลายเซ็น</p>
            )}

            {(!u.signatureImage || drawingFor === u.id) && (
              <SignaturePad onSave={dataUrl => saveSignature(u.id, dataUrl)} />
            )}

            {msgs[u.id] && (
              <p style={{ marginTop: 8, fontSize: 13, color: msgs[u.id].includes('บันทึก') || msgs[u.id].includes('ลบ') ? '#166534' : '#b91c1c' }}>
                {msgs[u.id]}
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
