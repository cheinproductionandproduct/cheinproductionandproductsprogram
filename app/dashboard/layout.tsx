'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { useUser } from '@/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { canApprove } from '@/lib/auth/permissions'
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

  const closeMobileMenu = () => setMobileMenuOpen(false)

  useEffect(() => {
    // Check Supabase auth directly
    const checkSupabaseAuth = async () => {
      const supabase = createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      setHasSupabaseUser(!!supabaseUser)
      
      // Store Supabase user info as fallback
      if (supabaseUser) {
        setSupabaseUserInfo({
          email: supabaseUser.email,
          fullName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
        })
      }
      
      // Only redirect if there's no Supabase user at all
      if (!supabaseUser && !loading) {
        router.push('/login')
      }
    }
    
    checkSupabaseAuth()
  }, [loading, router])

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
    <div className={`dashboard-layout ${mobileMenuOpen ? 'mobile-menu-open' : ''}`} style={{ display: 'flex', minHeight: '100vh', background: '#f0f0f0' }}>
      {/* SIDEBAR - desktop: always visible; mobile: drawer opened by hamburger */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar--open' : ''}`}>
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
            เอกสารรอดำเนินการ
          </Link>
          {/* Only show for managers/approvers/admins - never for EMPLOYEE */}
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
              เอกสารรออนุมัติ
            </Link>
          )}
          {user && user.role !== UserRole.EMPLOYEE && canApprove(user.role as UserRole) && (
            <Link
              href="/dashboard/advance-register"
              className={`nav-btn ${pathname === '/dashboard/advance-register' ? 'nav-btn--active' : ''}`}
              onClick={closeMobileMenu}
            >
              <span className="nav-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <line x1="10" y1="9" x2="8" y2="9"></line>
                </svg>
              </span>
              ทะเบียนคุมลูกหนี้เงินทดรอง
            </Link>
          )}
          <Link
            href="/approvals"
            className={`nav-btn ${pathname === '/approvals' ? 'nav-btn--active' : ''}`}
            onClick={closeMobileMenu}
          >
            <span className="nav-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            เอกสารที่อนุมัติแล้ว
          </Link>
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
