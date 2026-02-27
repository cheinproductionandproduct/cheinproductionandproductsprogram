// TypeScript types for Prisma JSON fields
// These help with type safety when working with JSON data in forms

// Form Template Field Definition
export interface FormField {
  name: string
  type: 'text' | 'number' | 'email' | 'date' | 'select' | 'textarea' | 'checkbox' | 'file' | 'items-table'
  label: string
  placeholder?: string
  required?: boolean
  validation?: {
    min?: number
    max?: number
    pattern?: string
    custom?: string
  }
  options?: Array<{ label: string; value: string }> // For select fields
  defaultValue?: string | number | boolean
  helpText?: string
}

// Items table data structure
export interface ItemRow {
  id: string
  description: string
  amount: number
}

// Form Template Configuration
export interface FormTemplateConfig {
  fields: FormField[]
  settings?: {
    allowDraft?: boolean
    autoNumber?: boolean
    numberPrefix?: string
    requireAttachments?: boolean
    maxAttachments?: number
  }
}

// Document Data (matches form fields)
export type DocumentData = Record<string, unknown>

// Document Relationship Metadata
export interface DocumentRelationshipMetadata {
  autoPopulated?: boolean
  fields?: string[] // Which fields were auto-populated
  notes?: string
}

// Workflow Step Settings (if needed in future)
export interface WorkflowStepSettings {
  timeout?: number // Days before auto-escalation
  notifyOnPending?: boolean
  allowDelegation?: boolean
}
