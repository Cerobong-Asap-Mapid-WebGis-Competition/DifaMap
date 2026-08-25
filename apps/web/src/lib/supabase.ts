import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tahxvguztbgijdemabiu.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaHh2Z3V6dGJnaWpkZW1hYml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NTQ2OTksImV4cCI6MjEwMzAzMDY5OX0.qQxLB8fFoE2H2yNigQi8CeiuXfdW1iIhjrUGJbBSp-4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
