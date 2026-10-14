import { defineConfig } from 'drizzle-kit';

/** `npm run db:generate` : crée la migration SQL correspondant aux changements de src/db/schema.ts. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
