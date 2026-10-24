import type { Database } from '@/types/database.types'

// Alias de dominio. Vive aparte para sobrevivir a `npm run db:types`,
// que sobrescribe database.types.ts por completo.
export type AppRole = Database['public']['Enums']['app_role']
