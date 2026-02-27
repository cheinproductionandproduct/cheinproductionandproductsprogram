/**
 * Delete ALL documents and all related rows (approvals, versions, attachments, relationships).
 * Use with care. Does not delete users, jobs, or form templates.
 *
 * Run: npm run db:clear-documents -- --confirm
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function run() {
  const confirm = process.argv.includes('--confirm')
  if (!confirm) {
    console.log(`
To clear ALL documents from the database, run:

  npm run db:clear-documents -- --confirm

This will permanently delete:
  - document_relationships
  - file_attachments
  - document_versions
  - approvals
  - documents

Users, jobs, and form templates are NOT deleted.
`)
    process.exit(0)
  }

  console.log('Clearing all documents and related data...')

  const rel = await prisma.documentRelationship.deleteMany({})
  console.log(`  Deleted ${rel.count} document_relationships`)

  const att = await prisma.fileAttachment.deleteMany({})
  console.log(`  Deleted ${att.count} file_attachments`)

  const ver = await prisma.documentVersion.deleteMany({})
  console.log(`  Deleted ${ver.count} document_versions`)

  const app = await prisma.approval.deleteMany({})
  console.log(`  Deleted ${app.count} approvals`)

  const doc = await prisma.document.deleteMany({})
  console.log(`  Deleted ${doc.count} documents`)

  console.log('Done. All documents have been removed.')
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
