'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import '../dashboard.css'
import { useUser } from '@/hooks/use-user'
import { isAdmin, isManager } from '@/lib/auth/permissions'
import type { VehicleRequestStatus } from '@prisma/client'

type RequestItem = {
  id: string
  type: string
  categorySlug: string
  subSlug: string
  serviceLabel: string
  status: VehicleRequestStatus
  createdAt: string
  requester: {
    id: string
    fullName: string | null
    email: string
    department: string | null
  }
  start: any
  dest: any
}

type FilterStatus = 'all' | VehicleRequestStatus

export default function VehicleRequestsPage() {
  const { user, loading: userLoading } = useUser()
  const [items, setItems] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    if (userLoading || !user) return
    fetchRequests()
  }, [user, userLoading, page, filter])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '30')
      if (filter !== 'all') params.set('status', filter)

      const res = await fetch(`/api/vehicle-requests?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'โหลดรายการไม่สำเร็จ')
      setItems(data.items || [])
      setPagination(data.pagination || { page: 1, limit: 30, total: 0, totalPages: 0 })
    } catch (e) {
      console.error(e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const canManageStatus = user && (isAdmin(user.role) || isManager(user.role))

  const handleStatusChange = async (id: string, status: VehicleRequestStatus) => {
    if (!canManageStatus) return
    setUpdatingId(id)
    try {
      const res = await fetch('/api/vehicle-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'อัปเดตสถานะไม่สำเร็จ')
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
    } catch (e) {
      console.error(e)
      alert('อัปเดตสถานะไม่สำเร็จ')
    } finally {
      setUpdatingId(null)
    }
  }

  if (userLoading || !user) {
    return (
      <div className="list-page">
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }

  return (
    <div className="list-page vehicle-page">
      <header className="list-header">
        <h1 className="page-title">รายการขอใช้รถ</h1>
        <p className="page-subtitle" lang="th">
          สำหรับผู้จัดการตรวจสอบ อนุมัติ และติดตามสถานะคำขอใช้รถจาก Messenger และหมวดรถอื่น ๆ
        </p>
      </header>

      <section className="list-content">
        <div className="list-panel">
          <div className="adv-reg-filters">
            <span className="adv-reg-filters-label">สถานะ:</span>
            <button
              type="button"
              className={`adv-reg-filter-btn ${filter === 'all' ? 'adv-reg-filter-btn--active' : ''}`}
              onClick={() => {
                setPage(1)
                setFilter('all')
              }}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              className={`adv-reg-filter-btn ${filter === 'PENDING' ? 'adv-reg-filter-btn--active' : ''}`}
              onClick={() => {
                setPage(1)
                setFilter('PENDING')
              }}
            >
              รออนุมัติ
            </button>
            <button
              type="button"
              className={`adv-reg-filter-btn ${filter === 'APPROVED' ? 'adv-reg-filter-btn--active' : ''}`}
              onClick={() => {
                setPage(1)
                setFilter('APPROVED')
              }}
            >
              อนุมัติแล้ว
            </button>
            <button
              type="button"
              className={`adv-reg-filter-btn ${filter === 'REJECTED' ? 'adv-reg-filter-btn--active' : ''}`}
              onClick={() => {
                setPage(1)
                setFilter('REJECTED')
              }}
            >
              ไม่อนุมัติ
            </button>
            <button
              type="button"
              className={`adv-reg-filter-btn ${filter === 'COMPLETED' ? 'adv-reg-filter-btn--active' : ''}`}
              onClick={() => {
                setPage(1)
                setFilter('COMPLETED')
              }}
            >
              เสร็จสิ้น
            </button>
          </div>

          {loading ? (
            <div className="list-loading">โหลด...</div>
          ) : items.length === 0 ? (
            <div className="list-empty" lang="th">
              ยังไม่มีรายการคำขอใช้รถ
            </div>
          ) : (
            <div className="adv-reg-table-wrap">
              <table className="adv-reg-table" lang="th">
                <thead>
                  <tr>
                    <th>วันที่ขอ</th>
                    <th>ผู้ขอ</th>
                    <th>แผนก</th>
                    <th>ประเภท</th>
                    <th>บริการ</th>
                    <th>จุดเริ่มต้น</th>
                    <th>จุดปลายทาง</th>
                    <th>สถานะ</th>
                    {canManageStatus && <th>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const createdAt = new Date(item.createdAt)
                    const createdText = createdAt.toLocaleString('th-TH', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    const requesterName = item.requester.fullName || item.requester.email
                    const startLocation = item.start?.location || '-'
                    const destLocation = item.dest?.location || '-'
                    const statusLabel: Record<VehicleRequestStatus, string> = {
                      PENDING: 'รออนุมัติ',
                      APPROVED: 'อนุมัติแล้ว',
                      REJECTED: 'ไม่อนุมัติ',
                      COMPLETED: 'เสร็จสิ้น',
                    }

                    return (
                      <tr key={item.id}>
                        <td>{createdText}</td>
                        <td>{requesterName}</td>
                        <td>{item.requester.department || '-'}</td>
                        <td>{item.type === 'messenger' ? 'Messenger' : 'รถ'}</td>
                        <td>{item.serviceLabel}</td>
                        <td>{startLocation}</td>
                        <td>{destLocation}</td>
                        <td>{statusLabel[item.status]}</td>
                        {canManageStatus && (
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="form-button list-page-btn"
                                disabled={updatingId === item.id || item.status === 'APPROVED'}
                                onClick={() => handleStatusChange(item.id, 'APPROVED')}
                              >
                                อนุมัติ
                              </button>
                              <button
                                type="button"
                                className="form-button list-page-btn"
                                disabled={updatingId === item.id || item.status === 'REJECTED'}
                                onClick={() => handleStatusChange(item.id, 'REJECTED')}
                              >
                                ไม่อนุมัติ
                              </button>
                              <button
                                type="button"
                                className="form-button list-page-btn"
                                disabled={updatingId === item.id || item.status === 'COMPLETED'}
                                onClick={() => handleStatusChange(item.id, 'COMPLETED')}
                              >
                                เสร็จสิ้น
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>

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
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

