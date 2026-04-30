import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { signatureImage: true },
  })

  return NextResponse.json({ signatureImage: row?.signatureImage ?? null })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { signatureImage } = await req.json()

  if (signatureImage !== null && typeof signatureImage !== 'string') {
    return NextResponse.json({ error: 'Invalid signatureImage' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { signatureImage: signatureImage ?? null },
  })

  return NextResponse.json({ ok: true })
}
