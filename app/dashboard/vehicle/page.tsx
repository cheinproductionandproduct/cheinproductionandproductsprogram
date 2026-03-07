'use client'

import Link from 'next/link'
import '../dashboard.css'

export default function VehicleDashboardPage() {
  return (
    <div className="list-page vehicle-page">
      <header className="list-header">
        <h1 className="page-title">ใบเบิกใบคุมการใช้รถ</h1>
        <p className="page-subtitle" lang="th">
          ระบบใบเบิกใบคุมการใช้รถ
        </p>
      </header>
      <Link href="/dashboard" className="form-button" style={{ marginBottom: 16 }}>
        กลับไปแดชบอร์ด
      </Link>
      <div className="vehicle-card-row">
        <div className="vehicle-card">
          <div className="vehicle-card-image"></div>
          <div className="vehicle-card-label">รถฉุกเฉิน</div>
          <button type="button" className="vehicle-enter-btn">Enter</button>
        </div>
        <div className="vehicle-card">
          <div className="vehicle-card-image"></div>
          <div className="vehicle-card-label">รถบริษัท</div>
          <button type="button" className="vehicle-enter-btn">Enter</button>
        </div>
        <div className="vehicle-card">
          <div className="vehicle-card-image"></div>
          <div className="vehicle-card-label">รถขนส่ง</div>
          <button type="button" className="vehicle-enter-btn">Enter</button>
        </div>
        <div className="vehicle-card">
          <div className="vehicle-card-image"></div>
          <div className="vehicle-card-label">Messenger</div>
          <button type="button" className="vehicle-enter-btn">Enter</button>
        </div>
      </div>
    </div>
  )
}
