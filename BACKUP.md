# Database backup plan (Supabase free tier)

## Two ways to backup

### Option A: One big file (full DB)

```bash
npm run db:backup
```

Saves **`backups/backup-YYYY-MM-DDTHH-MM-SS.json`** with all tables (users, documents, approvals, etc.).

---

### Option B: 1 document = 1 .txt file

```bash
npm run db:backup-txt
```

Saves **one .txt file per document** in **`backups/documents/`**:

- File name: `<documentNumber-or-id>.txt` (e.g. `APR-001-abc12345.txt`)
- Content: id, documentNumber, title, status, creator, dates, and the full `data` JSON

So: 1 document in Supabase → 1 .txt file. Easy to copy to cloud drive or search by file.

---

The folder **`backups/`** is gitignored so backups are not committed.

---

## Upload to Google Drive

Backup and upload in one step:

```bash
npm run db:backup-drive
```

This (1) creates the full backup JSON, (2) creates one .txt per document, (3) uploads both to your Google Drive folder.

### One-time setup

1. **Get your folder ID from the Google Drive link**  
   Your link looks like: `https://drive.google.com/drive/folders/1ABC...xyz`  
   The **folder ID** is the part after `/folders/`: `1ABC...xyz`

2. **Create a Google Cloud service account**  
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.  
   - **APIs & Services** → **Enable APIs** → enable **Google Drive API**.  
   - **APIs & Services** → **Credentials** → **Create credentials** → **Service account**.  
   - Create the account, then open it → **Keys** → **Add key** → **Create new key** → **JSON**.  
   - Save the downloaded JSON in your project (e.g. `google-service-account.json`).  
   - **Important:** In Google Drive, **share your backup folder** with the service account email (e.g. `xxx@yyy.iam.gserviceaccount.com`) as **Editor**.

3. **Add to `.env`** (create if needed):

```env
GOOGLE_DRIVE_FOLDER_ID=1ABC...xyz
GOOGLE_SERVICE_ACCOUNT_KEY=./google-service-account.json
```

4. Run:

```bash
npm run db:backup-drive
```

Uploaded: one full backup JSON + a folder of .txt files (one per document) for that run.

---

## Clear all documents

To **delete every document** (and approvals, versions, attachments, relationships) from the database:

```bash
npm run db:clear-documents -- --confirm
```

**Without `--confirm`** the script only prints instructions and does nothing.

- **Back up first:** run `npm run db:backup-drive` (or at least `npm run db:backup`) before clearing.  
- Users, jobs, and form templates are **not** deleted.

**Manual way (Prisma Studio):**  
1. Run `npm run db:studio`.  
2. Open **Document** (and related tables) and delete rows, or use **document_relationships** → **file_attachments** → **document_versions** → **approvals** → **documents** in that order.

---

## What gets backed up

All data needed to recover your app:

| Table | Content |
|-------|--------|
| `users` | User profiles (from Supabase Auth sync) |
| `jobs` | Job list |
| `form_templates` | Form definitions (APR, APC, etc.) |
| `approval_workflows` / `workflow_steps` | Workflow config |
| **`documents`** | **All document data (form submissions, signatures, etc.)** |
| `approvals` | Approval/signature records |
| `document_versions` | Version history |
| `file_attachments` | Attachment metadata (files live in Supabase Storage) |
| `document_relationships` | Links between documents |

---

## Recommended schedule

| When | Action |
|------|--------|
| **Weekly** | Run `npm run db:backup-drive` (backup + upload to Drive) or `npm run db:backup`. |
| **Before big changes** | Run backup before deploy or schema changes. |
| **Before clearing documents** | Run `npm run db:backup-drive` so you have a copy in Drive. |

### Optional: run automatically (Windows)

1. Open **Task Scheduler**.
2. Create Basic Task → Trigger: Weekly (e.g. Sunday 22:00).
3. Action: Start a program → Program: `npm`, Arguments: `run db:backup`, Start in: `C:\Users\mammo\Documents\cheinproductionandproduct`.
4. Finish.

---

## Restore from backup

If you lose data:

1. Get the backup file (e.g. `backups/backup-2026-02-25T10-00-00.json`).
2. Open it and use the JSON as reference to re-insert rows (e.g. via Prisma Studio, or a one-off script that reads the JSON and creates records).
3. **Documents** are the most critical: the `documents` array holds every form submission; each `data` field has the full payload.

For a full automated restore you’d need a custom script that clears tables (in the right order to respect foreign keys) and re-inserts from the backup JSON. If you want that script, we can add it later.

---

## Summary

- **Normal use won’t corrupt the DB.** Backups protect you from mistakes, rare outages, or account issues.
- **`npm run db:backup-drive`** = backup + upload to Google Drive (after one-time Drive setup).
- **`npm run db:clear-documents -- --confirm`** = delete all documents (back up first).
