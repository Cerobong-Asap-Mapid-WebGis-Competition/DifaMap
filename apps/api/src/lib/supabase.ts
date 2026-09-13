import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
// Fallback untuk Node.js <22: @supabase/supabase-js menginisialisasi RealtimeClient
// yang membutuhkan WebSocket constructor, meskipun backend hanya memakai Auth, Storage, dan RPC.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class DummyWebSocket {};
}

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
