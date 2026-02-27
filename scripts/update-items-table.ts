import { prisma } from '../lib/prisma'
import type { FormTemplateConfig } from '../types/database'

async function updateItemsTable() {
  console.log('Updating items field to items-table...')

  const template = await prisma.formTemplate.findUnique({
    where: { slug: 'advance-payment-request' },
  })

  if (!template) {
    console.error('Template not found')
    return
  }

  const currentFields = template.fields as unknown as FormTemplateConfig
  const updatedFields = {
    ...currentFields,
    fields: currentFields.fields.map((field) => {
      if (field.name === 'items') {
        return {
          ...field,
          type: 'items-table' as const,
          label: 'รายการ (Items)',
          helpText: 'Click + to add items to the list',
          placeholder: undefined,
        }
      }
      if (field.name === 'totalAmount') {
        return {
          ...field,
          helpText: 'Auto-calculated from items',
        }
      }
      return field
    }),
  }

  await prisma.formTemplate.update({
    where: { slug: 'advance-payment-request' },
    data: {
      fields: updatedFields as any,
    },
  })

  console.log('✅ Template updated successfully!')
}

updateItemsTable()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
