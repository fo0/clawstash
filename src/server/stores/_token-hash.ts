import crypto from 'crypto';

/**
 * SHA-256 hex digest used for both API tokens (`cs_*`) and admin sessions
 * (`csa_*`). Centralised so both stores share one source of truth.
 *
 * The algorithm and encoding MUST match the historical
 * ClawStashDB.hashToken exactly — changing it would invalidate every
 * issued token and force every admin to re-authenticate. Any future
 * migration to a different hash function must rotate stored hashes
 * via a versioned migration, not by editing this function.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
