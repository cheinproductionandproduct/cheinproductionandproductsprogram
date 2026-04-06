/**
 * Revert documents from PENDING → DRAFT for a given creator email.
 * Deletes workflow approval rows so the document can be edited and resubmitted.
 *
 * Dry run (list only):
 *   npx tsx scripts/revert-pending-docs-for-user.ts
 * Apply:
 *   npx tsx scripts/revert-pending-docs-for-user.ts --confirm
 *
 * Optional: pass email as first arg (default pc@cheinproduction.co.th)
 */

import { PrismaClient, DocumentStatus } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_EMAIL = 'pc@cheinproduction.co.th'

async function run() {
  const confirm = process.argv.includes('--confirm')
  const emailArg = process.argv.find((a) => a.includes('@') && !a.startsWith('--'))
  const email = emailArg || DEFAULT_EMAIL

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true },
  })
  if (!user) {
    console.error(`No user with email: ${email}`)
    process.exit(1)
  }

  const pending = await prisma.document.findMany({
    where: { createdById: user.id, status: DocumentStatus.PENDING },
    select: { id: true, documentNumber: true, title: true },
    orderBy: { updatedAt: 'desc' },
  })

  console.log(`User: ${user.email} (${user.fullName ?? 'no name'})`)
  console.log(`PENDING documents: ${pending.length}`)
  for (const d of pending) {
    console.log(`  - ${d.documentNumber ?? '(no number)'}  ${d.title}  [${d.id}]`)
  }

  if (pending.length === 0) {
    await prisma.$disconnect()
    return
  }

  if (!confirm) {
    console.log('\nAdd --confirm to set these to DRAFT and remove pending approvals.')
    await prisma.$disconnect()
    process.exit(0)
  }

  for (const d of pending) {
    await prisma.$transaction([
      prisma.approval.deleteMany({ where: { documentId: d.id } }),
      prisma.document.update({
        where: { id: d.id },
        data: {
          status: DocumentStatus.DRAFT,
          submittedAt: null,
          currentStep: null,
        },
      }),
    ])
  }

  console.log(`\nReverted ${pending.length} document(s) to DRAFT.`)
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
