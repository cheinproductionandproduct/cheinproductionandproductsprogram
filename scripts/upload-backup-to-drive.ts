/**
 * 1) Creates backup (full JSON + 1 txt per document)
 * 2) Uploads to Google Drive folder
 *
 * Run: npm run db:backup-drive
 *
 * Required .env:
 *   GOOGLE_DRIVE_FOLDER_ID=xxxx   (from folder link: .../folders/xxxx)
 *   GOOGLE_SERVICE_ACCOUNT_KEY=   path to JSON key file (e.g. ./google-service-account.json)
 *
 * One-time setup: See BACKUP.md "Upload to Google Drive"
 */

import 'dotenv/config'
import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

const BACKUPS_DIR = path.join(process.cwd(), 'backups')
const DOCUMENTS_DIR = path.join(BACKUPS_DIR, 'documents')

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    console.error(`Missing env: ${name}. Add it to .env`)
    process.exit(1)
  }
  return v.trim()
}

async function uploadFile(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  localPath: string,
  mimeType: string,
  driveFileName?: string
) {
  const name = driveFileName || path.basename(localPath)
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: fs.createReadStream(localPath) },
    fields: 'id, name',
  })
  console.log(`  Uploaded: ${name}`)
  return res.data
}

async function run() {
  const folderId = getEnv('GOOGLE_DRIVE_FOLDER_ID')
  const keyPath = getEnv('GOOGLE_SERVICE_ACCOUNT_KEY')
  const keyPathResolved = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath)
  if (!fs.existsSync(keyPathResolved)) {
    console.error(`Service account key file not found: ${keyPathResolved}`)
    process.exit(1)
  }
  const key = JSON.parse(fs.readFileSync(keyPathResolved, 'utf-8'))

  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
  const drive = google.drive({ version: 'v3', auth })

  const date = new Date().toISOString().slice(0, 10)
  const time = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  console.log('Uploading backups to Google Drive...')

  // 1) Upload latest full backup JSON if present
  let latestJson: string | null = null
  if (fs.existsSync(BACKUPS_DIR)) {
    const names = fs.readdirSync(BACKUPS_DIR).filter((n) => n.startsWith('backup-') && n.endsWith('.json'))
    if (names.length) latestJson = path.join(BACKUPS_DIR, names.sort().reverse()[0])
  }
  if (latestJson && fs.existsSync(latestJson)) {
    await uploadFile(
      drive,
      folderId,
      latestJson,
      'application/json',
      `backup-full-${date}.json`
    )
  } else {
    console.log('  (No backup-*.json found; run npm run db:backup first)')
  }

  // 2) Upload each .txt in backups/documents/ (1 doc = 1 file)
  if (fs.existsSync(DOCUMENTS_DIR)) {
    const txtFiles = fs.readdirSync(DOCUMENTS_DIR).filter((f) => f.endsWith('.txt'))
    const subfolderName = `documents-${date}-${time.slice(11, 19).replace(/-/g, '')}`
    const folderRes = await drive.files.create({
      requestBody: {
        name: subfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId],
      },
      fields: 'id',
    })
    const subfolderId = folderRes.data.id
    if (!subfolderId) throw new Error('Failed to create subfolder')
    console.log(`  Folder: ${subfolderName}`)
    for (const f of txtFiles) {
      const filePath = path.join(DOCUMENTS_DIR, f)
      await uploadFile(drive, subfolderId, filePath, 'text/plain')
    }
  } else {
    console.log('  (No backups/documents folder; run npm run db:backup-txt first)')
  }

  console.log('Done.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
