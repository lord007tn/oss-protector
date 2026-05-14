import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { env } from './src/env'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: env.CLOUDFLARE_D1_DATABASE_ID ?? '',
    token: env.CLOUDFLARE_D1_TOKEN ?? '',
  },
  strict: true,
  verbose: true,
})
