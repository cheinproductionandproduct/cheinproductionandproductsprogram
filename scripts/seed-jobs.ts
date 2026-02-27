import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const jobs = [
  { name: 'For Sale', description: 'For Sale items' },
  { name: 'สำนักงาน', description: 'Office items' },
  { name: '2022.001_Futurium(FTR.)G0,G1,G3:PO-202200033', description: null },
  { name: '2023.002_FTR.G2,G4,G5,G6 : PO-202300032', description: null },
  { name: '2023.003_FTR.G7 : PO-202300033', description: null },
  { name: '2023.006_FTR.ชั้น 4 (J3) : PO-202300064', description: null },
  { name: '2023.008,010_FTR.Model', description: null },
  { name: '2024.039_FTR.Signage(QT2024100001-5)', description: null },
  { name: '2025.012_งานไทยเฟรค', description: null },
  { name: '2025.015_JURASSIC WORLD @เอเชียทีค', description: null },
  { name: '2025.017_PTT. Museum', description: null },
  { name: '2025.019_Gistda_ศูนย์นวัตกรรมอวกาศ', description: null },
  { name: '2025.022_Gistda-Model มนุษย์อวกาศ', description: null },
  { name: '2025.024_5D THEATRE @RAMA 9 MUSEUM', description: null },
  { name: '2025.025_TIF.Office @CP.Tower North Park', description: null },
  { name: '2025.026_TIF.Office @สนามบิน พิษณุโลก', description: null },
  { name: '2025.027_Canbitec อยุธยา', description: null },
  { name: '2025.028_FTR.งานเพิ่มก่อนเปิด 11.11.2025', description: null },
  { name: '2026.001_Gistda งานเพิ่มเติม01', description: null },
]

async function main() {
  console.log('🌱 Seeding jobs...')

  for (const job of jobs) {
    const existing = await prisma.job.findFirst({
      where: { name: job.name },
    })

    if (existing) {
      console.log(`✓ Job already exists: ${job.name}`)
      continue
    }

    await prisma.job.create({
      data: {
        name: job.name,
        code: null,
        description: job.description,
        isActive: true,
      },
    })
    console.log(`✓ Created: ${job.name}`)
  }

  console.log('✅ Done seeding jobs!')
}

main()
  .catch((e) => {
    console.error('Error seeding jobs:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
