'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import '../dashboard.css'
import { useUser } from '@/hooks/use-user'
import { canApprove } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { formatDateDMY } from '@/lib/utils/date-format'
import { getClosestClearanceDueDate } from '@/lib/utils/distribution-dates'

const LINE_OFFICIAL_URL = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL || ''

type ClearanceStatus = 'cleared' | 'pending_clearance' | 'not_cleared'
type FilterStatus = 'all' | 'due' | 'past_due'

interface RegisterItem {
  apr: {
    id: string
    documentNumber: string | null
    title: string
    status: string
    data: any
    createdAt: string
    completedAt: string | null
    creator: { id: string; fullName: string | null; email: string }
  }
  clearanceDocument: { id: string; documentNumber: string | null; status: string; data?: any } | null
  clearanceStatus: ClearanceStatus
}

export default function AdvanceRegisterPage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [items, setItems] = useState<RegisterItem[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<FilterStatus>('all')

  useEffect(() => {
    if (userLoading) return
    if (user && (user.role === UserRole.EMPLOYEE || !canApprove(user.role as UserRole))) {
      router.replace('/dashboard')
      return
    }
    if (!user) return
    fetchRegister()
  }, [user, userLoading, page])

  const fetchRegister = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/documents/advance-register?page=${page}&limit=30`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to load')
      setItems(data.items || [])
      setPagination(data.pagination || { page: 1, limit: 30, total: 0, totalPages: 0 })
    } catch (e) {
      console.error(e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const getAmount = (apr: RegisterItem['apr']) => {
    const d = apr?.data || {}
    const total = d.items?.total ?? d.totalAmount ?? 0
    return typeof total === 'number' ? total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(total || '-')
  }

  /** True if APR was approved and clearance due date (from fixed list) has passed but not yet cleared */
  const isPastClearanceDate = (apr: RegisterItem['apr'], clearanceStatus: ClearanceStatus) => {
    if (clearanceStatus === 'cleared') return false
    const completedAt = apr.completedAt ? String(apr.completedAt).slice(0, 10) : ''
    if (!completedAt) return false
    const dueIso = getClosestClearanceDueDate(completedAt)
    if (!dueIso) return false
    const dueDate = new Date(dueIso + 'T23:59:59')
    return new Date() > dueDate
  }

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true
    if (item.clearanceStatus === 'cleared') return false
    const pastDue = isPastClearanceDate(item.apr, item.clearanceStatus)
    if (filter === 'past_due') return pastDue
    if (filter === 'due') return !pastDue
    return true
  })

  /** Items that are past due (for LINE follow-up) — from current page only */
  const pastDueItems = useMemo(
    () => items.filter((item) => isPastClearanceDate(item.apr, item.clearanceStatus)),
    [items]
  )

  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle')

  const getPastDueSummaryText = () => {
    const lines = ['รายการพ้นกำหนดเคลียร์เงินทดรอง (Advance Payment Clearance):', '']
    pastDueItems.forEach((item) => {
      const advNumber = item.apr.documentNumber || item.apr.id
      const name = item.apr.creator?.fullName || item.apr.creator?.email || '—'
      const due = getRepaymentDate(item)
      lines.push(`${advNumber} — ${name} — ครบกำหนด ${due}`)
    })
    return lines.join('\n')
  }

  const handleCopyForLine = async () => {
    try {
      await navigator.clipboard.writeText(getPastDueSummaryText())
      setCopyStatus('ok')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('fail')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  /** Repayment due date: from fixed clearance list (closest to approval + 15 days) or clearance doc date when cleared */
  const getRepaymentDate = (item: RegisterItem) => {
    if (item.clearanceStatus === 'cleared' && item.clearanceDocument?.data?.date)
      return formatDateDMY(item.clearanceDocument.data.date)
    const completedAt = item.apr.completedAt ? String(item.apr.completedAt).slice(0, 10) : ''
    if (!completedAt) return '—'
    const dueIso = getClosestClearanceDueDate(completedAt)
    return dueIso ? formatDateDMY(dueIso) : '—'
  }

  const formatMoney = (n: number | undefined | null) => {
    if (n == null || Number.isNaN(n)) return '—'
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  /** Total expenses from clearance doc; remaining to return or additional withdrawal */
  const getExpensesAndRemaining = (item: RegisterItem) => {
    const d = item.clearanceDocument?.data
    if (!d) return { totalExpenses: '—', remaining: '—' }
    const totalExpenses = d.totalExpenses ?? d.expenseItems?.total ?? 0
    const toReturn = Number(d.amountToReturn) ?? 0
    const additional = Number(d.additionalAmount) ?? 0
    const remaining = toReturn > 0 ? formatMoney(toReturn) : additional > 0 ? formatMoney(additional) : '—'
    return {
      totalExpenses: typeof totalExpenses === 'number' ? totalExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(totalExpenses || '—'),
      remaining,
    }
  }

  if (userLoading || !user || (user && (user.role === UserRole.EMPLOYEE || !canApprove(user.role as UserRole)))) {
    return (
      <div className="list-page">
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }

  return (
    <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">ทะเบียนคุมลูกหนี้เงินทดรอง</h1>
          <p className="page-subtitle" lang="th">
            ทะเบียนคุมลูกหนี้เงินทดรองและติดตามทวงถาม — รายการ APR และสถานะการเคลียร์ (APC)
          </p>
        </header>
        <section className="list-content">
          <div className="list-panel">
            {loading ? (
              <div className="list-loading">โหลด...</div>
            ) : items.length === 0 ? (
              <div className="list-empty">ไม่มีรายการใบเบิกเงินทดรอง</div>
            ) : (
              <>
                <div className="adv-reg-filters">
                  <span className="adv-reg-filters-label">แสดง:</span>
                  <button
                    type="button"
                    className={`adv-reg-filter-btn ${filter === 'all' ? 'adv-reg-filter-btn--active' : ''}`}
                    onClick={() => setFilter('all')}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    type="button"
                    className={`adv-reg-filter-btn ${filter === 'due' ? 'adv-reg-filter-btn--active' : ''}`}
                    onClick={() => setFilter('due')}
                  >
                    ยังไม่พ้นกำหนด
                  </button>
                  <button
                    type="button"
                    className={`adv-reg-filter-btn ${filter === 'past_due' ? 'adv-reg-filter-btn--active' : ''}`}
                    onClick={() => setFilter('past_due')}
                  >
                    พ้นกำหนด
                  </button>
                </div>
                {pastDueItems.length > 0 && LINE_OFFICIAL_URL && (
                  <div className="adv-reg-line-panel" lang="th">
                    <span className="adv-reg-line-label">ติดตามรายการพ้นกำหนดผ่าน LINE Official Account:</span>
                    <div className="adv-reg-line-actions">
                      <a
                        href={LINE_OFFICIAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="form-button adv-reg-line-btn adv-reg-line-btn--primary"
                      >
                        เปิด LINE
                      </a>
                      <button
                        type="button"
                        className="form-button adv-reg-line-btn adv-reg-line-btn--secondary"
                        onClick={handleCopyForLine}
                        title="คัดลอกรายการพ้นกำหนดไปวางในแชท LINE"
                      >
                        {copyStatus === 'ok' ? 'คัดลอกแล้ว' : copyStatus === 'fail' ? 'คัดลอกไม่สำเร็จ' : 'คัดลอกรายการสำหรับส่ง LINE'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="adv-reg-table-wrap">
                  {filteredItems.length === 0 ? (
                    <p className="adv-reg-empty-filter" lang="th">
                      {filter === 'all' ? 'ไม่มีรายการ' : filter === 'due' ? 'ไม่มีรายการที่ยังไม่พ้นกำหนด' : 'ไม่มีรายการที่พ้นกำหนด'}
                    </p>
                  ) : (
                  <table className="adv-reg-table" lang="th">
                    <thead>
                      <tr>
                        <th>เลขที่</th>
                        <th>ชื่อ - นามสกุล</th>
                        <th>วันที่ยืมเงินทดรอง</th>
                        <th>วันที่จัดกิจกรรม</th>
                        <th>วันที่คืนเงินทดรอง</th>
                        <th>จำนวนเงินเงินทดรอง</th>
                        <th>รวมค่าใช้จ่าย</th>
                        <th>เหลือส่งคืน/เบิกเพิ่ม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => {
                        const { apr, clearanceStatus } = item
                        const pastDue = isPastClearanceDate(apr, clearanceStatus)
                        const repaymentDate = getRepaymentDate(item)
                        const { totalExpenses, remaining } = getExpensesAndRemaining(item)
                        const dateLoan = apr.data?.date ? formatDateDMY(apr.data.date) : '—'
                        const dateActivity = apr.data?.dateMoneyNeeded ? formatDateDMY(apr.data.dateMoneyNeeded) : '—'
                        const advNumber = apr.documentNumber || apr.id
                        const creatorName = apr.creator?.fullName || apr.creator?.email || '—'
                        return (
                          <tr key={apr.id} className="adv-reg-table-row">
                            <td className="adv-reg-cell-no">
                              <Link href={`/documents/${apr.id}`} className="adv-reg-cell-link">
                                {advNumber}
                              </Link>
                            </td>
                            <td>
                              <Link href={`/documents/${apr.id}`} className="adv-reg-cell-link">
                                {creatorName}
                              </Link>
                            </td>
                            <td>{dateLoan}</td>
                            <td>{dateActivity}</td>
                            <td className="adv-reg-cell-repayment">
                              {pastDue && (
                                <span
                                  className="adv-reg-hazard"
                                  title="พ้นกำหนดเคลียร์เงินแล้ว (เกิน 15 วันนับจากวันรับเงิน)"
                                  aria-hidden
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                </span>
                              )}
                              {repaymentDate}
                            </td>
                            <td className="adv-reg-amount">{getAmount(apr)}</td>
                            <td className="adv-reg-amount">{totalExpenses}</td>
                            <td className="adv-reg-amount">{remaining}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
                {pagination.totalPages > 1 && (
                  <div className="list-pagination">
                    <span className="list-pagination-text">
                      หน้า {pagination.page} / {pagination.totalPages} (ทั้งหมด {pagination.total} รายการ)
                    </span>
                    <div className="list-pagination-buttons">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={pagination.page <= 1}
                        className="form-button list-page-btn"
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="form-button list-page-btn"
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
  )
}
