import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { ClawStashDB } from '../db.js';
import { ADMIN_PASSWORD, ADMIN_SESSION_HOURS, extractToken, validateAuth, isAuthEnabled, requireAdminAuth } from '../auth.js';

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

  // GET /api/admin/export - Export all stash data as ZIP
  router.get('/export', (req: Request, res: Response) => {
    const auth = requireAdminAuth(db, req);
    if (!auth) {
      res.status(401).json({ error: 'Admin access required' });
      return;
    }

    try {
      const data = db.exportAllData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="clawstash-export-${timestamp}.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err: Error) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create export archive' });
        }
      });

      archive.pipe(res);
      archive.append(JSON.stringify(data.stashes, null, 2), { name: 'stashes.json' });
      archive.append(JSON.stringify(data.stash_files, null, 2), { name: 'stash_files.json' });
      archive.append(JSON.stringify(data.stash_versions, null, 2), { name: 'stash_versions.json' });
      archive.append(JSON.stringify(data.stash_version_files, null, 2), { name: 'stash_version_files.json' });
      archive.append(JSON.stringify({ exportedAt: new Date().toISOString(), version: '1.0' }), { name: 'manifest.json' });
      archive.finalize();
    } catch (err) {
      console.error('Export error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export data' });
      }
    }
  });

  // POST /api/admin/import - Import stash data from ZIP
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
  router.post('/import', upload.single('file'), (req: Request, res: Response) => {
    const auth = requireAdminAuth(db, req);
    if (!auth) {
      res.status(401).json({ error: 'Admin access required' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();

      const readJson = (name: string): unknown[] => {
        const entry = entries.find(e => e.entryName === name);
        if (!entry) return [];
        return JSON.parse(entry.getData().toString('utf8'));
      };

      const stashes = readJson('stashes.json') as Record<string, unknown>[];
      const stash_files = readJson('stash_files.json') as Record<string, unknown>[];
      const stash_versions = readJson('stash_versions.json') as Record<string, unknown>[];
      const stash_version_files = readJson('stash_version_files.json') as Record<string, unknown>[];

      if (stashes.length === 0) {
        res.status(400).json({ error: 'No stash data found in ZIP file' });
        return;
      }

      const result = db.importAllData({ stashes, stash_files, stash_versions, stash_version_files });
      res.json({
        message: 'Import successful',
        imported: result,
      });
    } catch (err) {
      console.error('Import error:', err);
      res.status(400).json({ error: 'Failed to import data. Make sure the ZIP file is a valid ClawStash export.' });
    }
  });

  return router;
}
