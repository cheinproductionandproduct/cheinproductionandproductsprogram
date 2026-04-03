'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getVehicleCategoryBySlug, messengerSubSlug } from '@/lib/vehicle-categories'
import '../../dashboard.css'

export default function VehicleCategoryPage() {
  const params = useParams()
  const slug = params.category as string
  const category = getVehicleCategoryBySlug(slug)

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

  const isMessenger = category.slug === 'messenger'

  return (
    <div className="list-page vehicle-page">
      <header className="list-header">
        <h1 className="page-title">{category.label}</h1>
        <p className="page-subtitle" lang="th">
          เลือกรายการย่อย
        </p>
      </header>
      <Link href="/dashboard/vehicle" className="form-button" style={{ marginBottom: 16 }}>
        ← กลับไปหมวดรถ
      </Link>
      <div className="vehicle-sub-row">
        {category.sub.map((subLabel) => {
          const subSlug = messengerSubSlug(subLabel)
          const href = isMessenger
            ? `/dashboard/vehicle/messenger/${subSlug}`
            : `/dashboard/vehicle/${category.slug}/${subSlug}`

          return (
            <Link
              key={subLabel}
              href={href}
              className="vehicle-sub-card"
            >
              {subLabel}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
