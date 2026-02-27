import { PrismaClient, UserRole } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function createUsers() {
  try {
    console.log('👤 Creating users...')

    // Create jaguar (worker/employee)
    const jaguarId = randomUUID()
    const jaguar = await prisma.user.upsert({
      where: { email: 'jaguar@cheinproduction.co.th' },
      update: {
        role: UserRole.EMPLOYEE,
        fullName: 'Jaguar',
        isActive: true,
      },
      create: {
        id: jaguarId,
        email: 'jaguar@cheinproduction.co.th',
        fullName: 'Jaguar',
        role: UserRole.EMPLOYEE,
        isActive: true,
      },
    })

    console.log('✅ Created/Updated Jaguar:')
    console.log(`   ID: ${jaguar.id}`)
    console.log(`   Email: ${jaguar.email}`)
    console.log(`   Role: ${jaguar.role}`)
    console.log(`   ⚠️  IMPORTANT: When creating this user in Supabase, use this ID: ${jaguar.id}`)

    // Create bee (manager)
    const beeId = randomUUID()
    const bee = await prisma.user.upsert({
      where: { email: 'bee@cheinproduction.co.th' },
      update: {
        role: UserRole.MANAGER,
        fullName: 'Bee',
        isActive: true,
      },
      create: {
        id: beeId,
        email: 'bee@cheinproduction.co.th',
        fullName: 'Bee',
        role: UserRole.MANAGER,
        isActive: true,
      },
    })

    console.log('✅ Created/Updated Bee:')
    console.log(`   ID: ${bee.id}`)
    console.log(`   Email: ${bee.email}`)
    console.log(`   Role: ${bee.role}`)
    console.log(`   ⚠️  IMPORTANT: When creating this user in Supabase, use this ID: ${bee.id}`)

    console.log('\n📝 Next Steps:')
    console.log('1. Create these users in Supabase Auth')
    console.log('2. Make sure the Supabase user IDs match the Prisma IDs shown above')
    console.log('3. Add the role to Supabase user_metadata:')
    console.log('   - For jaguar: { "role": "EMPLOYEE" }')
    console.log('   - For bee: { "role": "MANAGER" }')
    console.log('4. When they log in, the sync will update their Prisma records automatically')

  } catch (error) {
    console.error('❌ Error creating users:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

createUsers()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })

