import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { isAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export async function POST() {
  const user = await getCurrentUser()
  if (!user || !isAdmin(user.role as UserRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Find the current default users for APC
  const [tassanee, pc, bee] = await Promise.all([
    prisma.user.findFirst({ where: { email: { contains: 'tassanee@chein', mode: 'insensitive' } } }),
    prisma.user.findFirst({ where: { email: { startsWith: 'pc@chein', mode: 'insensitive' } } }),
    prisma.user.findFirst({ where: { email: { startsWith: 'bee@chein', mode: 'insensitive' } } }),
  ])

  if (!tassanee || !pc || !bee) {
    return NextResponse.json({
      ok: false,
      error: `ไม่พบผู้ใช้: ${[!tassanee && 'tassanee', !pc && 'pc', !bee && 'bee'].filter(Boolean).join(', ')}`,
    }, { status: 400 })
  }

  // Find the APC (advance-payment-clearance) form template
  const template = await prisma.formTemplate.findFirst({
    where: { slug: 'advance-payment-clearance' },
    select: { id: true },
  })
  if (!template) {
    return NextResponse.json({ ok: false, error: 'ไม่พบ form template advance-payment-clearance' }, { status: 400 })
  }

  // Get all DRAFT APC documents
  const docs = await prisma.document.findMany({
    where: { formTemplateId: template.id, status: 'DRAFT' },
    select: { id: true, data: true, documentNumber: true },
  })

  let updated = 0
  for (const doc of docs) {
    const data = (doc.data ?? {}) as Record<string, any>
    const ua = data.userAssignments ?? {}

    const newUa = {
      ...ua,
      approver:  tassanee.id,
      recipient: pc.id,
      payer:     bee.id,
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: { data: { ...data, userAssignments: newUa } },
    })
    updated++
  }

  return NextResponse.json({
    ok: true,
    updated,
    assignedTo: {
      approver:  tassanee.fullName || tassanee.email,
      recipient: pc.fullName || pc.email,
      payer:     bee.fullName || bee.email,
    },
  })
}
