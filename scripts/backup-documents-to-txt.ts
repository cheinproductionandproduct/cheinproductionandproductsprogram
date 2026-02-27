/**
 * Backup: 1 document in Supabase = 1 .txt file.
 * Run: npm run db:backup-txt
 * Output: backups/documents/<documentNumber-or-id>.txt
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const BACKUPS_DIR = path.join(process.cwd(), 'backups', 'documents')

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)
}

async function run() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  }

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: { id: true, email: true, fullName: true } },
      formTemplate: { select: { name: true, slug: true } },
    },
  })

  console.log(`Backing up ${documents.length} documents to 1 file each...`)

  for (const doc of documents) {
    const label = doc.documentNumber || doc.id
    const filename = `${safeFilename(String(label))}-${doc.id.slice(0, 8)}.txt`
    const filepath = path.join(BACKUPS_DIR, filename)

    const lines: string[] = [
      `# Document backup`,
      `id: ${doc.id}`,
      `documentNumber: ${doc.documentNumber ?? ''}`,
      `title: ${doc.title}`,
      `status: ${doc.status}`,
      `formTemplate: ${doc.formTemplate?.name ?? ''} (${doc.formTemplate?.slug ?? ''})`,
      `createdBy: ${doc.creator?.fullName ?? ''} (${doc.creator?.email ?? ''})`,
      `createdAt: ${doc.createdAt.toISOString()}`,
      `submittedAt: ${doc.submittedAt?.toISOString() ?? ''}`,
      `completedAt: ${doc.completedAt?.toISOString() ?? ''}`,
      ``,
      `--- data (JSON) ---`,
      JSON.stringify(doc.data, null, 2),
    ]

    fs.writeFileSync(filepath, lines.join('\n'), 'utf-8')
  }

  console.log(`Done. ${documents.length} files in ${BACKUPS_DIR}`)
}

run()
  .catch((e) => {
    console.error('Backup failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
