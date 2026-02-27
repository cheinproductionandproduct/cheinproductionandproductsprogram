'use client'

import Link from 'next/link'
import { useUser } from '@/hooks/use-user'
import { canApprove } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'

export default function DashboardPage() {
  const { user } = useUser()
  const canSeeAdvanceRegister = user && user.role !== UserRole.EMPLOYEE && canApprove(user.role as UserRole)

  return (
    <>
      <h1 className="page-title page-title--dashboard">DASHBOARD</h1>
      <p className="page-subtitle">
        สวัสดีค้าบบ ขอให้สนุกกับการใช้งานระบบนะค้าบ - เขียนโดย mammoth คนเขียนโปรแกรมนี้
      </p>

      <div className="card-row card-row-top">
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">ใบเบิกเงินทดรองจ่าย</div>
          <Link href="/dashboard/advance">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">ใบเคลียร์เงินทดรองจ่าย</div>
          <Link href="/dashboard/advance-clearance">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
        {/* hidden until ready */}
        {canSeeAdvanceRegister && (
          <div className="card" style={{ display: 'none' }}>
            <div className="card-image"></div>
            <div className="card-label">ทะเบียนคุมลูกหนี้เงินทดรองและติดตามทวงถาม</div>
            <Link href="/dashboard/advance-register">
              <button className="enter-btn">Enter</button>
            </Link>
          </div>
        )}
      </div>

      {/* hidden until ready */}
      <div className="card-row card-row-bottom" style={{ display: 'none' }}>
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">ใบสำคัญเงินสดย่อย</div>
          <button className="enter-btn">Enter</button>
        </div>
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">ทะเบียนคุมเช็คจ่าย</div>
          <button className="enter-btn">Enter</button>
        </div>
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">ใบเบิกเงินสดย่อย</div>
          <button className="enter-btn">Enter</button>
        </div>
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">สรุปรายการจ่ายเงินสดย่อย</div>
          <button className="enter-btn">Enter</button>
        </div>
        <div className="card">
          <div className="card-image"></div>
          <div className="card-label">สมุดบัญชีคุมเงินสดย่อย</div>
          <button className="enter-btn">Enter</button>
        </div>
      </div>
    </>
  )
}
