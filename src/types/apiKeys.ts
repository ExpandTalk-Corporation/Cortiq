/**
 * API Keys types for Public REST API
 * Task #5: Publikt REST API med dokumentation
 */

export interface ApiKey {
  id: string;
  company_id: string;
  site_id: string;
  key_hash: string;
  key_prefix: string; // First 8 chars for display
  name: string;
  permissions: string[];
  rate_limit: number;
  last_used_at: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface ApiKeyCreate {
  company_id: string;
  site_id: string;
  name: string;
  permissions?: string[];
  rate_limit?: number;
  expires_at?: string | null;
}

export interface ApiKeyUsage {
  id: number;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  request_ip: string;
  user_agent: string;
  created_at: string;
}

export interface ApiKeyStats {
  total_requests: number;
  requests_last_hour: number;
  requests_today: number;
  avg_response_time_ms: number;
  error_rate: number;
  last_used_at: string | null;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Generate a new API key
 * Format: ck_live_[32 random chars]
 */
export function generateApiKey(): string {
  const prefix = 'ck_live_';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // CSPRNG, not Math.random: the key is a bearer credential. 248 = 62 * 4, so
  // rejecting bytes >= 248 keeps every character equally likely.
  let key = prefix;
  while (key.length < prefix.length + 32) {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    for (const b of bytes) {
      if (b < 248 && key.length < prefix.length + 32) key += chars[b % chars.length];
    }
  }

  return key;
}

/**
 * Get key prefix for display (first 8 chars + ...)
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 12) + '...';
}

/**
 * Hash API key for storage
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
