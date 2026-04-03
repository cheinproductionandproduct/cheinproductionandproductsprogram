'use client'

import Link from 'next/link'
import { useUser } from '@/hooks/use-user'
import { isManager } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  // Show Sale Report card while loading so it appears immediately for managers (hide after load if not manager)
  const canSeeSaleReport = userLoading || (user && isManager(user.role as UserRole))

  return (
    <>
      <h1 className="page-title page-title--dashboard">DASHBOARD</h1>
      <p className="page-subtitle">
        สวัสดีค้าบบ ขอให้สนุกกับการใช้งานระบบนะค้าบ - เขียนโดย mammoth คนเขียนโปรแกรมนี้
      </p>

      <div className="card-row card-row-top">
        <div className="card">
          <div className="card-image card-image--apr"></div>
          <div className="card-label">ใบเบิกเงินทดรองจ่าย</div>
          <Link href="/dashboard/advance/new">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
        <div className="card">
          <div className="card-image card-image--apc"></div>
          <div className="card-label">ใบเคลียร์เงินทดรองจ่าย</div>
          <Link href="/dashboard/advance-clearance">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
        <div className="card">
          <div className="card-image card-image--debtlist"></div>
          <div className="card-label">ทะเบียนคุมลูกหนี้เงินทดรอง</div>
          <Link href="/dashboard/advance-register">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
        <div className="card">
          <div className="card-image card-image--boq"></div>
          <div className="card-label">BOQ (Bill of Quantities)</div>
          <Link href="/dashboard/boq">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
      </div>

      <div className="card-row card-row-bottom">
        <div className="card">
          <div className="card-image card-image--car"></div>
          <div className="card-label">Car List (รายการรถ)</div>
          <Link href="/dashboard/vehicle">
            <button className="enter-btn">Enter</button>
          </Link>
        </div>
        {canSeeSaleReport && (
          <div className="card">
            <div className="card-image"></div>
            <div className="card-label">รายงานยอดขาย (Sale Report)</div>
            <Link href="/dashboard/sale-report">
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
