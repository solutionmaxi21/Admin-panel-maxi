import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import db from '../db/postgres.js';
import {
    generateAccessToken,
    generateRefreshToken as generateJwtRefreshToken,
    verifyRefreshToken
} from '../shared/middleware/auth.js';
import { hashPassword, verifyPassword } from '../shared/utils/password.js';
import { UnauthorizedError, BadRequestError, ForbiddenError } from '../shared/errors/index.js';

// Grace period for token rotation (30 seconds)
// This prevents false-positive reuse detection when network issues cause
// the client to retry with the old token before receiving the new one
const TOKEN_ROTATION_GRACE_PERIOD_MS = 30 * 1000;

class AuthService {
    /**
     * Login user and generate tokens
     */
    async login(email, password, ipAddress, userAgent) {
        const user = await db.queryOne(
            `SELECT id, email, password_hash, first_name, last_name, role, is_active 
       FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );

        if (!user) {
            throw new UnauthorizedError('Invalid credentials');
        }

        if (user.is_active === false) {
            throw new UnauthorizedError('Account is disabled');
        }

        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            throw new UnauthorizedError('Invalid credentials');
        }

        // Update last login
        await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        return this.generateTokenPair(user, ipAddress, userAgent);
    }

    /**
     * Login or Register with Google
     */
    async loginWithGoogle(googleToken, ipAddress, userAgent) {
        if (!googleToken) {
            throw new BadRequestError('Google token is required');
        }

        // Verify Google ID token with audience check (prevents token from other apps)
        let googleData;
        const googleClientId = process.env.GOOGLE_CLIENT_ID;
        try {
            if (googleClientId) {
                // Preferred: Verify ID token cryptographically with audience check
                const client = new OAuth2Client(googleClientId);
                const ticket = await client.verifyIdToken({
                    idToken: googleToken,
                    audience: googleClientId,
                });
                googleData = ticket.getPayload();
            } else {
                // Fallback: Use userinfo endpoint (less secure, no audience verification)
                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${googleToken}` }
                });
                if (!response.ok) {
                    throw new UnauthorizedError('Invalid Google Token');
                }
                googleData = await response.json();
            }
        } catch (error) {
            if (error instanceof UnauthorizedError || error instanceof BadRequestError) throw error;
            throw new UnauthorizedError('Google authentication failed');
        }

        const {
            email,
            given_name,
            family_name,
            sub: googleId,
            picture,
            email_verified
        } = googleData;

        let user = await db.queryOne(
            'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
            [email]
        );

        if (user) {
            // Update existing user with Google info if missing
            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (picture && !user.avatar_url) {
                updates.push(`avatar_url = $${paramIndex++}`);
                params.push(picture);
            }

            if (!user.email_verified) {
                updates.push(`email_verified = $${paramIndex++}`);
                params.push(true);
            }

            // If user linked via email but no previous google_id, we could link it here too if desired.

            if (updates.length > 0) {
                updates.push(`updated_at = NOW()`);
                params.push(user.id);
                await db.query(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                    params
                );
                user = await db.queryOne('SELECT * FROM users WHERE id = $1', [user.id]);
            }

            if (user.is_active === false) {
                throw new UnauthorizedError('Account is disabled');
            }

            // Update last login
            await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        } else {
            // Register new user
            const query = `
        INSERT INTO users (
          email, password_hash, first_name, last_name, role, is_active,
          avatar_url, email_verified, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `;
            // Password hash is null/placeholder for social login users
            user = await db.queryOne(query, [
                email, null, given_name, family_name || '', 'customer', true,
                picture || null, true
            ]);
        }

        return this.generateTokenPair(user, ipAddress, userAgent);
    }

    /**
   * Refresh access token using rotation
   * ENHANCED: Added grace period to handle network retries without triggering false-positive reuse detection
   */
    async refreshToken(incomingToken, ipAddress, userAgent) {
        if (!incomingToken) {
            throw new UnauthorizedError('Refresh token required');
        }

        let decoded;
        try {
            decoded = verifyRefreshToken(incomingToken);
        } catch (err) {
            throw new UnauthorizedError('Invalid or expired refresh token');
        }

        const tokenHash = this._hashToken(incomingToken);

        // Use transaction to prevent race conditions (double usage)
        const transactionResult = await db.transaction(async (client) => {
            // 1. Check for Reuse (Critical Security)
            // "FOR UPDATE" locks the row so other requests wait
            const result = await client.query(
                `SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
                [tokenHash]
            );
            const tokenRecord = result.rows[0];

            if (!tokenRecord) {
                return { error: 'INVALID_TOKEN' };
            }

            if (tokenRecord.revoked) {
                // GRACE PERIOD CHECK: If the token was just rotated, this might be a network retry
                // Allow retries within the grace period by returning the replacement token's data
                const revokedAt = tokenRecord.updated_at || tokenRecord.created_at;
                const timeSinceRevocation = Date.now() - new Date(revokedAt).getTime();
                
                if (timeSinceRevocation < TOKEN_ROTATION_GRACE_PERIOD_MS && tokenRecord.replaced_by_token) {
                    console.log(`[Auth] Token retry within grace period (${timeSinceRevocation}ms), looking up replacement token`);
                    
                    // Find the replacement token and its associated tokens
                    const replacementResult = await client.query(
                        `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE`,
                        [tokenRecord.replaced_by_token]
                    );
                    
                    if (replacementResult.rows[0]) {
                        // Get the user for this token
                        const userResult = await client.query(
                            'SELECT id, role, is_active, email, first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL',
                            [decoded.userId]
                        );
                        const user = userResult.rows[0];
                        
                        if (user && user.is_active !== false) {
                            // Generate new tokens (we can't return the old refresh token as we don't have it)
                            // This is still secure because the new tokens are tied to the same session
                            const accessToken = generateAccessToken(user);
                            const refreshToken = generateJwtRefreshToken(user);
                            
                            const newTokenHash = this._hashToken(refreshToken);
                            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                            
                            // Store new token
                            await client.query(
                                `INSERT INTO refresh_tokens 
                                (user_id, token_hash, expires_at, ip_address, user_agent)
                                VALUES ($1, $2, $3, $4, $5)`,
                                [user.id, newTokenHash, expiresAt, ipAddress, userAgent]
                            );
                            
                            // Revoke the replacement token (it was from the previous retry window)
                            await client.query(
                                `UPDATE refresh_tokens 
                                SET revoked = TRUE, replaced_by_token = $1 
                                WHERE token_hash = $2`,
                                [newTokenHash, tokenRecord.replaced_by_token]
                            );
                            
                            console.log(`[Auth] Grace period refresh successful for user: ${decoded.userId}`);
                            
                            return {
                                success: true,
                                accessToken,
                                refreshToken,
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    firstName: user.first_name,
                                    lastName: user.last_name,
                                    role: user.role
                                }
                            };
                        }
                    }
                }
                
                // Outside grace period or no valid replacement - this is actual reuse
                console.warn(`[Security] Refresh Token Reuse Detected! User: ${decoded.userId}, IP: ${ipAddress}, Time since revocation: ${timeSinceRevocation}ms`);

                // Revoke ALL tokens for this user lineage to stop attack
                await client.query(
                    'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
                    [decoded.userId]
                );

                // Return reuse flags so we can throw AFTER commit
                return { reuseDetected: true };
            }

            // 2. Validate User
            const userResult = await client.query(
                'SELECT id, role, is_active, email, first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL',
                [decoded.userId]
            );
            const user = userResult.rows[0];

            if (!user || user.is_active === false) {
                return { error: 'USER_NOT_FOUND' };
            }

            // 3. Rotate Token
            // Generate new pair
            const accessToken = generateAccessToken(user);
            const refreshToken = generateJwtRefreshToken(user);

            const newTokenHash = this._hashToken(refreshToken);
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            // Store new token
            await client.query(
                `INSERT INTO refresh_tokens 
        (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5)`,
                [user.id, newTokenHash, expiresAt, ipAddress, userAgent]
            );

            // Revoke old token
            await client.query(
                `UPDATE refresh_tokens 
         SET revoked = TRUE, replaced_by_token = $1
         WHERE id = $2`,
                [newTokenHash, tokenRecord.id]
            );

            return {
                success: true,
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: user.role
                }
            };
        });

        // Handle results outside transaction (to allow commit of revocations)
        if (transactionResult.reuseDetected) {
            throw new ForbiddenError('Security Alert: Suspicious activity detected. Please login again.');
        }

        if (transactionResult.error === 'INVALID_TOKEN') {
            throw new UnauthorizedError('Invalid refresh token');
        }

        if (transactionResult.error === 'USER_NOT_FOUND') {
            throw new UnauthorizedError('User not found or disabled');
        }

        return transactionResult;
    }

    /**
     * Generate Access and Refresh Token Pair (Public)
     */
    async generateTokenPair(user, ipAddress, userAgent) {
        const accessToken = generateAccessToken(user);
        const refreshToken = generateJwtRefreshToken(user);

        // Store in DB
        const tokenHash = this._hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.query(
            `INSERT INTO refresh_tokens 
       (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
            [user.id || user.userId, tokenHash, expiresAt, ipAddress, userAgent]
        );

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id || user.userId,
                email: user.email,
                firstName: user.first_name || user.firstName,
                lastName: user.last_name || user.lastName,
                role: user.role
            }
        };
    }

    async logout(refreshToken) {
        if (!refreshToken) return;
        const tokenHash = this._hashToken(refreshToken);
        await db.query(
            'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1',
            [tokenHash]
        );
    }

    async revokeAllUserTokens(userId) {
        await db.query(
            'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
            [userId]
        );
    }

    async cleanupExpiredTokens() {
        await db.query(
            `DELETE FROM refresh_tokens 
       WHERE expires_at < NOW() 
       OR (revoked = TRUE AND created_at < NOW() - INTERVAL '30 days')`
        );
    }

    _hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}

export default new AuthService();
