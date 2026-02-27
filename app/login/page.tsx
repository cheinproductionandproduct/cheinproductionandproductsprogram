'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import './login.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message || 'Invalid email or password')
        setLoading(false)
        return
      }

      if (data.user) {
        // Sync user to Prisma - wait for it to complete
        try {
          const syncResponse = await fetch('/api/auth/sync-user', { method: 'POST' })
          if (!syncResponse.ok) {
            throw new Error('Failed to sync user')
          }
        } catch (syncError) {
          console.error('Sync error:', syncError)
          setError('Failed to sync user. Please try again.')
          setLoading(false)
          return
        }
        
        // Wait a bit for auth state to propagate, then redirect
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Use window.location for hard redirect to ensure clean navigation
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login')
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img 
            src="/cheinprodlogo-removebg-preview.png" 
            alt="Chein Logo" 
            className="login-logo"
          />
          <h1 className="login-title">Chein Production &amp; Products</h1>
          <p className="login-subtitle">COMPANY INTERNAL PROGRAM</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              อีเมล (Email)
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="form-input"
              placeholder="name@cheinprod.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              รหัสผ่าน (Password)
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="form-input"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-button"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ (Login)'}
          </button>
        </form>

        <div className="login-footer">
          <p className="login-footer-text">
            Need an account? Contact your administrator to create one.
          </p>
        </div>
      </div>
    </div>
  )
}

