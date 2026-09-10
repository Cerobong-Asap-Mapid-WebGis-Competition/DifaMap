import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  MAPID_API_KEY: z.string().min(1, 'MAPID_API_KEY is required'),
  MAPID_BASE_URL: z.string().url().default('https://api.mapid.io'),
  MAPID_BASEMAP_URL: z.string().url().default('https://basemap.mapid.io'),
  MAPID_GEOSERVER_URL: z.string().url().default('https://geoserver.mapid.io'),
  MAPID_COMPETITION_URL: z.string().url().default('https://server.mapid.io/web/competition'),
  MAPID_PROJECT_ID: z.string().default('6a8bb9c9880d11c7bade0a62'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;

