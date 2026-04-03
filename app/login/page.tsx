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
        // Give the browser time to commit auth cookies before server reads them
        await new Promise(resolve => setTimeout(resolve, 300))
        // Sync user to Prisma (with retry once if session not yet visible to server)
        let syncOk = false
        for (let attempt = 0; attempt < 2 && !syncOk; attempt++) {
          try {
            const syncResponse = await fetch('/api/auth/sync-user', {
              method: 'POST',
              credentials: 'include',
            })
            if (syncResponse.ok) {
              syncOk = true
              break
            }
            const errBody = await syncResponse.json().catch(() => ({}))
            const msg = errBody.message || errBody.error || 'Failed to sync user'
            if (syncResponse.status === 401 && attempt === 0) {
              await new Promise(resolve => setTimeout(resolve, 400))
              continue
            }
            throw new Error(msg)
          } catch (syncError: any) {
            if (attempt === 1) {
              console.error('Sync error:', syncError)
              setError(syncError?.message || 'Failed to sync user. Please try again.')
              setLoading(false)
              return
            }
            await new Promise(resolve => setTimeout(resolve, 400))
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100))
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

