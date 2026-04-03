'use client'

import Link from 'next/link'
import { VEHICLE_CATEGORIES } from '@/lib/vehicle-categories'
import '../dashboard.css'

export default function VehicleDashboardPage() {
  return (
    <div className="list-page vehicle-page">
      <header className="list-header">
        <h1 className="page-title">Car List (รายการรถ)</h1>
        <p className="page-subtitle" lang="th">
          ระบบใบเบิกใบคุมการใช้รถ — เริ่มจาก Messenger
        </p>
      </header>
      <Link href="/dashboard" className="form-button" style={{ marginBottom: 16 }}>
        กลับไปแดชบอร์ด
      </Link>
      <div className="vehicle-card-row">
        {VEHICLE_CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/dashboard/vehicle/${cat.slug}`}
            className="vehicle-card vehicle-card-link"
          >
            <div className="vehicle-card-image vehicle-card-image--car"></div>
            <div className="vehicle-card-label">{cat.label}</div>
            <span className="vehicle-enter-btn">Enter</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
