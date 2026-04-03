'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { useUser } from '@/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { canApprove, isAdmin, isManager } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'
import './dashboard.css'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const { user, loading } = useUser()
  const router = useRouter()
  const [hasSupabaseUser, setHasSupabaseUser] = useState<boolean | null>(null)
  const [supabaseUserInfo, setSupabaseUserInfo] = useState<{ email?: string; fullName?: string } | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false)

  const closeMobileMenu = () => setMobileMenuOpen(false)

  useEffect(() => {
    let cancelled = false

    const checkSupabaseAuth = async () => {
      const supabase = createClient()
      const {
        data: { user: supabaseUser },
      } = await supabase.auth.getUser()
      if (cancelled) return

      setHasSupabaseUser(!!supabaseUser)

      if (supabaseUser) {
        setSupabaseUserInfo({
          email: supabaseUser.email,
          fullName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
        })
      } else {
        setSupabaseUserInfo(null)
      }

      if (!supabaseUser) {
        router.push('/login')
      }
    }

    checkSupabaseAuth()

    return () => {
      cancelled = true
    }
  }, [router])

  // Show loading only when we have no user yet and still checking (avoids flash when returning to tab with cached user)
  if (loading && !user && hasSupabaseUser === null) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }}>
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }

  // If no Supabase user, don't render (will redirect)
  if (hasSupabaseUser === false) {
    return null
  }

  // Render dashboard if Supabase user exists (even if Prisma user isn't synced yet)
  // The useUser hook will eventually sync it

  return (
    <div
      className={`dashboard-layout ${mobileMenuOpen ? 'mobile-menu-open' : ''} ${desktopSidebarCollapsed ? 'desktop-sidebar-collapsed' : ''}`}
      style={{ display: 'flex', minHeight: '100vh', background: '#f0f0f0' }}
    >
      {/* SIDEBAR - desktop: always visible; mobile: drawer opened by hamburger */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar--open' : ''} ${desktopSidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setDesktopSidebarCollapsed(true)}
          aria-label="ยุบเมนูด้านข้าง"
          title="ยุบเมนู"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div className="logo-area">
          <img 
            src="/cheinprodlogo-removebg-preview.png" 
            alt="Chein Logo" 
            className="logo-image"
          />
          <div className="brand-name">Chein Production &amp; Products</div>
          <div className="brand-sub">COMPANY INTERNAL PROGRAM</div>
        </div>
        <button type="button" className="sidebar-close-btn" onClick={closeMobileMenu} aria-label="ปิดเมนู">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <nav className="nav">
          <Link
            href="/dashboard"
            className={`nav-btn ${pathname === '/dashboard' ? 'nav-btn--active' : ''}`}
            onClick={closeMobileMenu}
          >
            <span className="nav-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </span>
            หน้าหลัก
          </Link>
          <Link
            href="/documents"
            className={`nav-btn ${pathname === '/documents' ? 'nav-btn--active' : ''}`}
            onClick={closeMobileMenu}
          >
            <span className="nav-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </span>
            เอกสาร
          </Link>
          {/* Managers/approvers: documents waiting for their signature */}
          {user && user.role !== UserRole.EMPLOYEE && canApprove(user.role as UserRole) && (
            <Link
              href="/signing"
              className={`nav-btn ${pathname === '/signing' ? 'nav-btn--active' : ''}`}
              onClick={closeMobileMenu}
            >
              <span className="nav-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </span>
              เอกสารที่ต้องเซ็น
            </Link>
          )}
          <Link
            href="/rejected"
            className={`nav-btn ${pathname === '/rejected' ? 'nav-btn--active' : ''}`}
            onClick={closeMobileMenu}
          >
            <span className="nav-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="8" y1="8" x2="16" y2="16"></line>
                <line x1="16" y1="8" x2="8" y2="16"></line>
              </svg>
            </span>
            เอกสารถูกปฏิเสธ
          </Link>
          <Link
            href="/jobs"
            className={`nav-btn ${pathname === '/jobs' ? 'nav-btn--active' : ''}`}
            onClick={closeMobileMenu}
          >
            <span className="nav-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
                <rect x="9" y="3" width="6" height="4" rx="2"></rect>
              </svg>
            </span>
            Job List
          </Link>
          <Link
            href="/dashboard/boq"
            className={`nav-btn ${pathname?.startsWith('/dashboard/boq') ? 'nav-btn--active' : ''}`}
            onClick={closeMobileMenu}
          >
            <span className="nav-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </span>
            BOQ
          </Link>
          {user && (isManager(user.role as UserRole) || isAdmin(user.role as UserRole)) && (
            <Link
              href="/dashboard/vehicle-requests"
              className={`nav-btn ${pathname === '/dashboard/vehicle-requests' ? 'nav-btn--active' : ''}`}
              onClick={closeMobileMenu}
            >
              <span className="nav-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="4" rx="1" />
                  <rect x="3" y="10" width="18" height="4" rx="1" />
                  <rect x="3" y="16" width="10" height="4" rx="1" />
                </svg>
              </span>
              รายการขอใช้รถ
            </Link>
          )}
          {user && isAdmin(user.role as UserRole) && (
            <Link
              href="/dashboard/admin"
              className={`nav-btn ${pathname === '/dashboard/admin' ? 'nav-btn--active' : ''}`}
              onClick={closeMobileMenu}
            >
              <span className="nav-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </span>
              Admin
            </Link>
          )}
        </nav>
        <div className="user-area">
          <div className="user-card">
            <div className="user-info">
              {(() => {
                const displayName = user?.fullName || supabaseUserInfo?.fullName
                const email = user?.email || supabaseUserInfo?.email || ''
                const username = email ? email.split('@')[0] : ''
                const displayText = displayName || username || 'ผู้ใช้'
                const avatarLetter = displayName?.[0] || username?.[0] || email?.[0] || 'U'
                
                return (
                  <>
                    <div className="avatar">
                      {avatarLetter.toUpperCase()}
                    </div>
                    <div>
                      <div className="user-name">
                        {displayText}
                      </div>
                      <div className="user-email">
                        {email || 'ไม่มีอีเมล'}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
            <LogoutButton className="logout-btn">
              ออกจากระบบ
            </LogoutButton>
          </div>
        </div>
      </aside>

      {/* Backdrop - mobile only, closes drawer when tapped */}
      <div className="sidebar-backdrop" onClick={closeMobileMenu} aria-hidden="true" />

      <div className="dashboard-main-wrap">
        {desktopSidebarCollapsed && (
          <button
            type="button"
            className="sidebar-expand-btn"
            onClick={() => setDesktopSidebarCollapsed(false)}
            aria-label="ขยายเมนูด้านข้าง"
            title="แสดงเมนู"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        )}
        {/* Mobile-only top bar with hamburger — hidden on desktop via CSS */}
        <header className="mobile-header">
          <button type="button" className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="เปิดเมนู">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <span className="mobile-header-title">Chein Production</span>
        </header>

        {/* MAIN CONTENT */}
        <main className="dashboard-main">
          {children}
        </main>
      </div>
    </div>
  )
}
