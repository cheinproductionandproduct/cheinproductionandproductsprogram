# Environment Variables Setup Guide

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

### Database Connection (Supabase)

1. **DATABASE_URL** - Connection string for Prisma (with connection pooling)
   - Format: `postgresql://postgres:[PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1`
   - Found in: Supabase Dashboard > Project Settings > Database > Connection String > URI

2. **DIRECT_URL** - Direct connection string (without pooling)
   - Format: `postgresql://postgres:[PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres`
   - Same location as above, but use the "Direct connection" option

### Supabase API Keys

3. **NEXT_PUBLIC_SUPABASE_URL** - Your Supabase project URL
   - Format: `https://[PROJECT-REF].supabase.co`
   - Found in: Supabase Dashboard > Project Settings > API > Project URL

4. **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Public anonymous key
   - Found in: Supabase Dashboard > Project Settings > API > Project API keys > anon public

5. **SUPABASE_SERVICE_ROLE_KEY** - Service role key (keep secret!)
   - Found in: Supabase Dashboard > Project Settings > API > Project API keys > service_role secret
   - ⚠️ **Never expose this in client-side code!**

### Application

6. **NEXT_PUBLIC_APP_URL** - Your application URL
   - Development: `http://localhost:3000`
   - Production: Your Vercel deployment URL

## How to Get Your Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and sign in
2. Create a new project or select an existing one
3. Wait for the project to finish setting up
4. Go to **Project Settings** (gear icon in sidebar)
5. Navigate to **API** section for URL and keys
6. Navigate to **Database** section for connection strings

## Security Notes

- Never commit `.env` file to version control
- The `.env` file is already in `.gitignore`
- Use `.env.example` as a template (without actual values)
- For Vercel deployment, add these variables in the Vercel dashboard under Project Settings > Environment Variables
