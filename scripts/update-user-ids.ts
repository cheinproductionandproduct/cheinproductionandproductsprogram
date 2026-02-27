import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Helper script to update Prisma user IDs after creating users in Supabase
 * 
 * Usage:
 * 1. Create users in Supabase Auth
 * 2. Get their IDs from Supabase
 * 3. Update this script with the correct IDs
 * 4. Run: npx tsx scripts/update-user-ids.ts
 */

async function updateUserIds() {
  try {
    console.log('🔄 Updating user IDs to match Supabase...')

    // Supabase user IDs from the dashboard
    const SUPABASE_JAGUAR_ID = 'aeae6aef-0c60-4eb3-bf55-3a0cc5ee3501'
    const SUPABASE_BEE_ID = 'b73eed9b-e921-4b54-a55f-0011d0bf1cc2'

    // Update jaguar
    const jaguar = await prisma.user.update({
      where: { email: 'jaguar@cheinproduction.co.th' },
      data: { id: SUPABASE_JAGUAR_ID },
    })
    console.log('✅ Updated Jaguar ID:', jaguar.id)

    // Update bee
    const bee = await prisma.user.update({
      where: { email: 'bee@cheinproduction.co.th' },
      data: { id: SUPABASE_BEE_ID },
    })
    console.log('✅ Updated Bee ID:', bee.id)

    console.log('\n✅ All user IDs updated!')
    console.log('Users can now log in and their data will sync correctly.')

  } catch (error: any) {
    if (error.code === 'P2002') {
      console.error('❌ Error: A user with this ID already exists. The IDs might already be set.')
    } else {
      console.error('❌ Error updating user IDs:', error)
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

updateUserIds()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })

