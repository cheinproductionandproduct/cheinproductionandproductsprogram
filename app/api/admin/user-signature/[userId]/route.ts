import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { prisma } from '@/lib/prisma'

const ALLOWED_EMAIL = 'kunanon2010th@gmail.com'

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const user = await getCurrentUser()
  if (!user || user.email?.toLowerCase() !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const row = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, fullName: true, email: true, signatureImage: true },
  })
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const user = await getCurrentUser()
  if (!user || user.email?.toLowerCase() !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const { signatureImage } = await req.json()
  await prisma.user.update({
    where: { id: params.userId },
    data: { signatureImage: signatureImage ?? null },
  })
  return NextResponse.json({ ok: true })
}
