'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/hooks/use-user'
import '../dashboard.css'

export default function ProfilePage() {
  const { user } = useUser()
  const [savedSig, setSavedSig] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/users/me/signature')
      .then(r => r.json())
      .then(d => { setSavedSig(d.signatureImage ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    setMsg(null)
  }

  const save = async () => {
    const data = preview ?? savedSig
    if (!data) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/users/me/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureImage: data }),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      setSavedSig(data)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      setMsg({ type: 'ok', text: 'บันทึกลายเซ็นเรียบร้อยแล้ว' })
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('ลบลายเซ็นที่บันทึกไว้?')) return
    setSaving(true)
    setMsg(null)
    try {
      await fetch('/api/users/me/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureImage: null }),
      })
      setSavedSig(null)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      setMsg({ type: 'ok', text: 'ลบลายเซ็นแล้ว' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">โปรไฟล์ / ลายเซ็น</h1>
        <p className="page-subtitle" lang="th">{user?.fullName || user?.email}</p>
      </header>

      <section className="list-content">
        <div className="list-panel" style={{ maxWidth: 640 }}>
          <h2 className="form-section-title" style={{ marginBottom: 16 }}>ลายเซ็นของฉัน</h2>
          <p className="form-hint" style={{ marginBottom: 20 }} lang="th">
            อัปโหลดภาพลายเซ็นของคุณ (PNG / JPG พื้นหลังขาว) —
            เมื่อคลิก <strong>อนุมัติ</strong> ระบบจะนำลายเซ็นนี้ไปวางในเอกสารโดยอัตโนมัติ
          </p>

          {loading ? (
            <div className="list-loading">โหลด...</div>
          ) : (
            <>
              {/* Current saved signature */}
              {savedSig && !preview && (
                <div style={{ marginBottom: 24 }}>
                  <p className="form-label" style={{ marginBottom: 8 }}>ลายเซ็นที่บันทึกอยู่</p>
                  <div style={{
                    border: '1px solid #ddd', borderRadius: 8, padding: 12,
                    background: '#fafafa', display: 'inline-block',
                  }}>
                    <img src={savedSig} alt="saved signature" style={{ maxHeight: 100, maxWidth: 400, display: 'block' }} />
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="form-button"
                      onClick={() => fileRef.current?.click()}
                    >
                      เปลี่ยนลายเซ็น
                    </button>
                    <button
                      type="button"
                      className="form-button"
                      style={{ background: '#fff', color: '#c00', border: '1px solid #c00' }}
                      onClick={remove}
                      disabled={saving}
                    >
                      ลบลายเซ็น
                    </button>
                  </div>
                </div>
              )}

              {/* No signature yet */}
              {!savedSig && !preview && (
                <div style={{ marginBottom: 24 }}>
                  <p className="form-hint" style={{ marginBottom: 12 }}>ยังไม่มีลายเซ็นที่บันทึก</p>
                  <button type="button" className="form-button" onClick={() => fileRef.current?.click()}>
                    อัปโหลดลายเซ็น
                  </button>
                </div>
              )}

              {/* New file preview */}
              {preview && (
                <div style={{ marginBottom: 24 }}>
                  <p className="form-label" style={{ marginBottom: 8 }}>ตัวอย่างลายเซ็นใหม่</p>
                  <div style={{
                    border: '2px dashed #1976d2', borderRadius: 8, padding: 12,
                    background: '#f0f7ff', display: 'inline-block',
                  }}>
                    <img src={preview} alt="new signature" style={{ maxHeight: 100, maxWidth: 400, display: 'block' }} />
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="form-button form-button-submit"
                      onClick={save}
                      disabled={saving}
                    >
                      {saving ? 'กำลังบันทึก...' : 'บันทึกลายเซ็น'}
                    </button>
                    <button
                      type="button"
                      className="form-button"
                      style={{ background: '#fff', color: '#000' }}
                      onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                      disabled={saving}
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ display: 'none' }}
                onChange={onFileChange}
              />

              {msg && (
                <div style={{
                  padding: '10px 14px', borderRadius: 6, marginTop: 8,
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
