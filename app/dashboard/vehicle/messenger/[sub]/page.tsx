'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { MESSENGER_SUB_LABELS } from '@/lib/vehicle-categories'
import { useRouter } from 'next/navigation'
import { PlaceAutocompleteInput } from '@/components/vehicle/PlaceAutocompleteInput'
import '../../../dashboard.css'

type PlaceResult = { address: string; placeId?: string; lat?: number; lng?: number }

export default function MessengerRequestPage() {
  const params = useParams()
  const subSlug = (params.sub as string) || ''
  const serviceLabel = MESSENGER_SUB_LABELS[subSlug.toLowerCase()] || subSlug

  const router = useRouter()

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
      const res = await fetch('/api/vehicle-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'messenger',
          categorySlug: 'messenger',
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
      // Optionally go back to Messenger list after short delay
      setTimeout(() => {
        router.push('/dashboard/vehicle/messenger')
      }, 800)
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="list-page vehicle-page">
      <header className="list-header">
        <h1 className="page-title">Messenger — {serviceLabel}</h1>
        <p className="page-subtitle" lang="th">
          จุดรับ และจุดปลายทาง (ค้นหาสถานที่จาก Google Map)
        </p>
      </header>

      <Link href="/dashboard/vehicle/messenger" className="form-button" style={{ marginBottom: 24 }}>
        ← กลับไป Messenger
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
            <label className="form-label">สถานที่ (Location) — ค้นหาจาก Google Map</label>
            <PlaceAutocompleteInput
              value={startLocation}
              onChange={handleStartLocationChange}
              placeholder="พิมพ์ค้นหาที่อยู่หรือสถานที่"
              className="form-input"
            />
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
            <label className="form-label">สถานที่ (Location) — ค้นหาจาก Google Map</label>
            <PlaceAutocompleteInput
              value={destLocation}
              onChange={handleDestLocationChange}
              placeholder="พิมพ์ค้นหาที่อยู่หรือสถานที่"
              className="form-input"
            />
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button type="submit" className="form-button form-button-submit" disabled={submitting}>
            {submitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
          </button>
          <Link href="/dashboard/vehicle" className="form-button">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  )
}
