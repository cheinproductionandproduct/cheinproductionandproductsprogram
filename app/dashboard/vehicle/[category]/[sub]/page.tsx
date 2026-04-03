'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { getVehicleCategoryBySlug, messengerSubSlug } from '@/lib/vehicle-categories'
import '../../../dashboard.css'

type PlaceResult = { address: string; placeId?: string; lat?: number; lng?: number }

export default function VehicleRequestPage() {
  const params = useParams()
  const categorySlug = (params.category as string) || ''
  const subSlug = (params.sub as string) || ''

  const category = getVehicleCategoryBySlug(categorySlug)

  // Resolve human-readable sub label from slug
  const serviceLabel =
    category?.sub.find((label) => messengerSubSlug(label) === subSlug) || subSlug

  const [startName, setStartName] = useState('')
  const [startPhone, setStartPhone] = useState('')
  const [startTime, setStartTime] = useState('')
  const [startLocation, setStartLocation] = useState('')
  const [startPlace, setStartPlace] = useState<PlaceResult | null>(null)

  const [destName, setDestName] = useState('')
  const [destPhone, setDestPhone] = useState('')
  const [destTime, setDestTime] = useState('')
  const [destLocation, setDestLocation] = useState('')
  const [destPlace, setDestPlace] = useState<PlaceResult | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const router = useRouter()

  const handleStartLocationChange = (result: PlaceResult) => {
    setStartLocation(result.address)
    setStartPlace(result)
  }

  const handleDestLocationChange = (result: PlaceResult) => {
    setDestLocation(result.address)
    setDestPlace(result)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setSuccess(false)

    try {
      if (!category) throw new Error('ไม่พบหมวดรถ')

      const res = await fetch('/api/vehicle-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vehicle',
          categorySlug: category.slug,
          subSlug,
          serviceLabel,
          start: {
            name: startName,
            phone: startPhone,
            time: startTime,
            location: startLocation,
            place: startPlace,
          },
          dest: {
            name: destName,
            phone: destPhone,
            time: destTime,
            location: destLocation,
            place: destPlace,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.message || 'ส่งคำขอล้มเหลว')
      }

      setSuccess(true)
      setTimeout(() => {
        router.push(`/dashboard/vehicle/${category.slug}`)
      }, 800)
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  if (!category) {
    return (
      <div className="list-page vehicle-page">
        <Link href="/dashboard/vehicle" className="form-button" style={{ marginBottom: 16 }}>
          ← กลับไปหมวดรถ
        </Link>
        <p className="list-error">ไม่พบหมวดนี้</p>
      </div>
    )
  }

  return (
    <div className="list-page vehicle-page">
      <header className="list-header">
        <h1 className="page-title">
          {category.label} — {serviceLabel}
        </h1>
        <p className="page-subtitle" lang="th">
          จุดรับ และจุดปลายทาง
        </p>
      </header>

      <Link href={`/dashboard/vehicle/${category.slug}`} className="form-button" style={{ marginBottom: 24 }}>
        ← กลับไป {category.label}
      </Link>

      <form onSubmit={handleSubmit} className="form-container" style={{ maxWidth: 640 }}>
        {error && (
          <p className="form-error" lang="th" style={{ marginBottom: 12 }}>
            {error}
          </p>
        )}
        {success && (
          <p className="form-success" lang="th" style={{ marginBottom: 12 }}>
            ส่งคำขอเรียบร้อยแล้ว
          </p>
        )}
        <div className="form-section">
          <h2 className="form-section-title">จุดเริ่มต้น (Starting point)</h2>
          <div className="form-field-group">
            <label className="form-label">ชื่อ (Name)</label>
            <input
              type="text"
              className="form-input"
              value={startName}
              onChange={(e) => setStartName(e.target.value)}
              placeholder="ชื่อผู้ส่งหรือจุดรับ"
            />
          </div>
          <div className="form-field-group">
            <label className="form-label">เบอร์โทร (Phone)</label>
            <input
              type="tel"
              className="form-input"
              value={startPhone}
              onChange={(e) => setStartPhone(e.target.value)}
              placeholder="เบอร์โทรจุดเริ่มต้น"
            />
          </div>
          <div className="form-field-group">
            <label className="form-label">เวลา (Time)</label>
            <input
              type="datetime-local"
              className="form-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="form-field-group">
            <label className="form-label">สถานที่ (Location)</label>
            <input type="text" className="form-input" value={startLocation}
              onChange={e => handleStartLocationChange({ address: e.target.value })}
              placeholder="พิมพ์ที่อยู่หรือสถานที่" />
          </div>
        </div>

        <div className="form-section" style={{ marginTop: 24 }}>
          <h2 className="form-section-title">จุดปลายทาง (Destination)</h2>
          <div className="form-field-group">
            <label className="form-label">ชื่อ (Name)</label>
            <input
              type="text"
              className="form-input"
              value={destName}
              onChange={(e) => setDestName(e.target.value)}
              placeholder="ชื่อผู้รับหรือจุดปลายทาง"
            />
          </div>
          <div className="form-field-group">
            <label className="form-label">เบอร์โทร (Phone)</label>
            <input
              type="tel"
              className="form-input"
              value={destPhone}
              onChange={(e) => setDestPhone(e.target.value)}
              placeholder="เบอร์โทรจุดปลายทาง"
            />
          </div>
          <div className="form-field-group">
            <label className="form-label">เวลา (Time)</label>
            <input
              type="datetime-local"
              className="form-input"
              value={destTime}
              onChange={(e) => setDestTime(e.target.value)}
            />
          </div>
          <div className="form-field-group">
            <label className="form-label">สถานที่ (Location)</label>
            <input type="text" className="form-input" value={destLocation}
              onChange={e => handleDestLocationChange({ address: e.target.value })}
              placeholder="พิมพ์ที่อยู่หรือสถานที่" />
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button type="submit" className="form-button form-button-submit" disabled={submitting}>
            {submitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
          </button>
          <Link href={`/dashboard/vehicle/${category.slug}`} className="form-button">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  )
}

