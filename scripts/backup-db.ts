/**
 * Database backup script (Supabase / PostgreSQL via Prisma).
 * Exports all critical tables to a single JSON file in ./backups/.
 *
 * Run: npm run db:backup
 * Requires: .env with DATABASE_URL set.
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const BACKUPS_DIR = path.join(process.cwd(), 'backups')

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  }
}

async function run() {
  ensureBackupsDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `backup-${timestamp}.json`
  const filepath = path.join(BACKUPS_DIR, filename)

  console.log('Backing up database...')

  const [
    users,
    jobs,
    formTemplates,
    documents,
    approvals,
    documentVersions,
    fileAttachments,
    documentRelationships,
    approvalWorkflows,
    workflowSteps,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.job.findMany(),
    prisma.formTemplate.findMany(),
    prisma.document.findMany(),
    prisma.approval.findMany(),
    prisma.documentVersion.findMany(),
    prisma.fileAttachment.findMany(),
    prisma.documentRelationship.findMany(),
    prisma.approvalWorkflow.findMany(),
    prisma.workflowStep.findMany(),
  ])

  const backup = {
    _meta: {
      exportedAt: new Date().toISOString(),
      schema: 'cheinproduction-backup-v1',
    },
    users,
    jobs,
    formTemplates,
    approvalWorkflows,
    workflowSteps,
    documents,
    approvals,
    documentVersions,
    fileAttachments,
    documentRelationships,
  }

  fs.writeFileSync(filepath, JSON.stringify(backup, null, 0), 'utf-8')
  const size = (fs.statSync(filepath).size / 1024).toFixed(1)
  console.log(`Done. Saved to ${filepath} (${size} KB)`)
}

run()
  .catch((e) => {
    console.error('Backup failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
