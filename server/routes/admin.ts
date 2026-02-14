import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ClawStashDB } from '../db.js';
import { ADMIN_PASSWORD, ADMIN_SESSION_HOURS, extractToken, validateAuth, isAuthEnabled } from '../auth.js';

export function createAdminRouter(db: ClawStashDB): Router {
  const router = Router();

  // POST /api/admin/auth - Login with password
  router.post('/auth', (req: Request, res: Response) => {
    const password = ADMIN_PASSWORD();

    if (!password) {
      // No password configured - open mode, no session needed
      res.json({
        token: '',
        expiresAt: null,
        message: 'No ADMIN_PASSWORD configured - open access mode',
      });
      return;
    }

    const { password: inputPassword } = req.body;
    if (!inputPassword || typeof inputPassword !== 'string') {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const inputHash = crypto.createHash('sha256').update(inputPassword).digest();
    const storedHash = crypto.createHash('sha256').update(password).digest();
    if (!crypto.timingSafeEqual(inputHash, storedHash)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const hours = ADMIN_SESSION_HOURS();
    const session = db.createAdminSession(hours);

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
    });
  });

  // POST /api/admin/logout - Invalidate session
  router.post('/logout', (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    db.deleteAdminSession(token);
    res.json({ message: 'Logged out' });
  });

  // GET /api/admin/session - Check session status
  router.get('/session', (req: Request, res: Response) => {
    if (!isAuthEnabled()) {
      res.json({
        authenticated: true,
        authRequired: false,
        source: 'open',
        scopes: ['read', 'write', 'admin', 'mcp'],
      });
      return;
    }

    const token = extractToken(req);
    if (!token) {
      res.json({ authenticated: false, authRequired: true });
      return;
    }

    const auth = validateAuth(db, token);
    if (!auth.authenticated) {
      res.json({ authenticated: false, authRequired: true });
      return;
    }

    res.json({
      authenticated: true,
      authRequired: true,
      source: auth.source,
      scopes: auth.scopes,
      expiresAt: auth.expiresAt ?? null,
    });
  });

  return router;
}
