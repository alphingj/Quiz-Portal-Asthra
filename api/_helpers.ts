// Shared helpers for Vercel serverless API routes.
// Creates a Supabase client using the service_role key (bypasses RLS).

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

/** Creates a Supabase admin client (service_role — bypasses RLS). */
export function getServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY server environment variables.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Sign a short-lived admin JWT. */
export function signAdminToken(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET environment variable.');
  return jwt.sign({ role: 'admin' }, secret, { expiresIn: '4h' });
}

/** Verify an admin JWT from the Authorization header. Returns true if valid. */
export function verifyAdminToken(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  try {
    const decoded = jwt.verify(token, secret);
    return typeof decoded === 'object' && decoded !== null && (decoded as any).role === 'admin';
  } catch {
    return false;
  }
}

// Simple in-memory sliding-window rate limiter
const attempts = new Map<string, number[]>();
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT = 10; // max attempts per window

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const history = (attempts.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (history.length >= RATE_LIMIT) {
    attempts.set(ip, history);
    return true;
  }
  history.push(now);
  attempts.set(ip, history);
  return false;
}
