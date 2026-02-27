# Database Schema Documentation

## Overview

This document describes the flexible database schema designed to support a dynamic form and document management system with e-signing capabilities.

## Core Concepts

### 1. **Form Templates** (Dynamic Forms)
Forms are defined as templates in the database, allowing new forms to be added without code changes. Each template defines:
- Form structure (fields, types, validation)
- Form settings (auto-numbering, attachments, etc.)

### 2. **Documents** (Form Submissions)
Documents are instances of form templates. They store:
- Form data as JSON (flexible structure)
- Status and workflow state
- Metadata (creator, dates, etc.)

### 3. **Approval Workflows** (Configurable)
Each form type can have a custom approval workflow with multiple steps. Steps can be assigned to:
- Specific users
- User roles (any user with that role can approve)

### 4. **Document Relationships** (Linking)
Documents can be linked together (e.g., Clearance → Request) with relationship types and metadata.

## Schema Details

### User Management

#### `User`
Extends Supabase Auth with additional profile information.

- **id**: Matches Supabase `auth.users.id`
- **email**: User email (unique)
- **role**: UserRole enum (ADMIN, MANAGER, APPROVER, EMPLOYEE)
- **fullName, department, position**: Profile information
- **isActive**: Soft delete flag

**Relations:**
- Created documents
- Approvals given
- Workflow step assignments

### Form System

#### `FormTemplate`
Defines a form type that can be used to create documents.

- **name**: Display name (e.g., "Advance Payment Request")
- **slug**: URL-friendly identifier (e.g., "advance-payment-request")
- **fields**: JSON array of field definitions
- **settings**: JSON object with form-specific settings

**Field Definition Structure:**
```typescript
{
  name: string
  type: 'text' | 'number' | 'email' | 'date' | 'select' | 'textarea' | 'checkbox' | 'file'
  label: string
  required?: boolean
  validation?: { min?, max?, pattern?, custom? }
  options?: Array<{ label, value }> // For select fields
}
```

#### `Document`
A form submission instance.

- **formTemplateId**: Which form template this document uses
- **documentNumber**: Auto-generated unique number (e.g., "APR-2024-001")
- **title**: Document title
- **status**: DRAFT | PENDING | APPROVED | REJECTED | CANCELLED
- **currentStep**: Current workflow step (null if no workflow)
- **data**: JSON object containing form field values
- **createdById**: User who created the document

**Indexes:**
- formTemplateId, createdById, status, createdAt (for efficient queries)

### Approval System

#### `ApprovalWorkflow`
Defines the approval sequence for a form type.

- **formTemplateId**: One workflow per form template
- **name, description**: Workflow metadata
- **steps**: Related WorkflowStep records

#### `WorkflowStep`
A single step in an approval workflow.

- **stepNumber**: Order (1, 2, 3, ...)
- **name, description**: Step metadata
- **assigneeRole**: If set, any user with this role can approve
- **assigneeId**: If set, specific user must approve
- **isRequired**: Can this step be skipped?
- **canReject**: Can this step reject the document?

#### `Approval`
Tracks each approval/signature.

- **documentId, workflowStepId**: Which document and step
- **approverId**: User who approved
- **status**: PENDING | APPROVED | REJECTED
- **comments**: Approval/rejection comments
- **signatureData**: Base64 signature image or hash
- **approvedAt, rejectedAt**: Timestamps

**Unique Constraint:** One approval per step per document

### Audit & Versioning

#### `DocumentVersion`
Tracks document changes for audit trail.

- **documentId, version**: Document and version number
- **data**: Snapshot of document data at this version
- **status**: Document status at this version
- **changedBy**: User ID who made the change
- **changeNote**: Optional note about the change

### File Management

#### `FileAttachment`
References to files stored in Supabase Storage.

- **documentId**: Which document this file belongs to
- **fileName**: Original file name
- **filePath**: Path in Supabase Storage
- **fileSize**: Size in bytes
- **mimeType**: File MIME type
- **uploadedBy**: User ID

### Document Relationships

#### `DocumentRelationship`
Links documents together.

- **parentDocId**: Source document
- **childDocId**: Linked document
- **relationshipType**: e.g., "clearance_of", "revision_of", "related_to"
- **metadata**: Additional relationship data (e.g., which fields were auto-populated)

**Use Case:** Advance Payment Clearance links to Advance Payment Request

## Example Workflow

1. **Create Form Template**
   - Define "Advance Payment Request" with fields: amount, reason, date
   - Create approval workflow with steps: Manager → Finance

2. **User Creates Document**
   - Document created with status DRAFT
   - User fills in form data (stored in `data` JSON field)
   - User submits → status changes to PENDING

3. **Approval Process**
   - System creates Approval records for each workflow step
   - Step 1 (Manager): Manager receives notification
   - Manager approves → signature stored, status updated
   - Step 2 (Finance): Finance receives notification
   - Finance approves → document status → APPROVED

4. **Create Related Document**
   - User creates "Advance Payment Clearance"
   - Links to original Request via DocumentRelationship
   - Auto-populates fields from Request document

## Adding New Forms

To add a new form type:

1. **Create FormTemplate** (via admin UI or seed):
   ```typescript
   {
     name: "New Form Name",
     slug: "new-form-slug",
     fields: { fields: [...] },
     settings: { ... }
   }
   ```

2. **Create ApprovalWorkflow** (optional):
   - Define workflow steps
   - Assign approvers (by role or user)

3. **Done!** The system can now handle this form type without code changes.

## Database Migrations

After modifying the schema:

```bash
# Development: Push changes directly
npm run db:push

# Production: Create migration
npm run db:migrate

# Generate Prisma Client
npm run db:generate
```

## Seeding Initial Data

Run the seed script to create example form templates:

```bash
npm run db:seed
```

This creates:
- Advance Payment Request form template
- Advance Payment Clearance form template
- Their respective approval workflows
