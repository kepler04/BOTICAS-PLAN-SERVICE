import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'
import type { Database } from '@/types/database.types'

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = getEnv()

/** Cliente único de Supabase (solo clave anon; NUNCA service_role en el frontend). */
export const supabase = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
