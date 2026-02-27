import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  
  // Get the origin from the request
  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  // Redirect to login page after logout
  return NextResponse.redirect(new URL('/login', origin), {
    status: 303, // See Other - forces GET request
  })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  
  // Get the origin from the request
  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  // Redirect to login page after logout
  return NextResponse.redirect(new URL('/login', origin))
}
