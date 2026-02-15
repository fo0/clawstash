import { Router, Request, Response, NextFunction } from 'express';
import { ClawStashDB } from '../db.js';
import { requireScopeAuth, extractToken } from '../auth.js';
import type { TokenScope } from '../db.js';

export function createStashRouter(db: ClawStashDB): Router {
  const router = Router();

  // Auth middleware factory — standard Express pattern
  function requireScope(scope: TokenScope) {
    return (req: Request, res: Response, next: NextFunction) => {
      const auth = requireScopeAuth(db, req, scope);
      if (auth) { next(); return; }
      const token = extractToken(req);
      if (!token) {
        res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
      } else {
        res.status(403).json({ error: 'Insufficient permissions.' });
      }
    };
  }

  // Resolve access source from request header
  function getAccessSource(req: Request): 'ui' | 'api' {
    return (req.headers['x-access-source'] as string) === 'ui' ? 'ui' : 'api';
  }

  // List stashes
  router.get('/', requireScope('read'), (req: Request, res: Response) => {
    const { search, tag, page, limit } = req.query;
    const result = db.listStashes({
      search: search as string,
      tag: tag as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  });

  // Get stats
  router.get('/stats', requireScope('read'), (req: Request, res: Response) => {
    res.json(db.getStats());
  });

  // Get all tags
  router.get('/tags', requireScope('read'), (req: Request, res: Response) => {
    res.json(db.getAllTags());
  });

  // Get all metadata keys
  router.get('/metadata-keys', requireScope('read'), (req: Request, res: Response) => {
    res.json(db.getAllMetadataKeys());
  });

  // Get tag graph (nodes + co-occurrence edges)
  router.get('/graph', requireScope('read'), (req: Request, res: Response) => {
    const { tag, depth, min_weight, min_count, limit } = req.query;
    res.json(db.getTagGraph({
      tag: tag as string | undefined,
      depth: depth ? parseInt(depth as string, 10) : undefined,
      min_weight: min_weight ? parseInt(min_weight as string, 10) : undefined,
      min_count: min_count ? parseInt(min_count as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    }));
  });

  // Get stash graph (stash nodes with relations, timeline, and version edges)
  router.get('/graph/stashes', requireScope('read'), (req: Request, res: Response) => {
    const { mode, since, until, tag, limit, include_versions, min_shared_tags } = req.query;
    res.json(db.getStashGraph({
      mode: (mode as 'relations' | 'timeline' | 'versions') || undefined,
      since: since as string | undefined,
      until: until as string | undefined,
      tag: tag as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      include_versions: include_versions === 'true',
      min_shared_tags: min_shared_tags ? parseInt(min_shared_tags as string, 10) : undefined,
    }));
  });

  // Get version history for a stash
  router.get('/:id/versions', requireScope('read'), (req: Request<{ id: string }>, res: Response) => {
    if (!db.stashExists(req.params.id)) {
      res.status(404).json({ error: 'Stash not found' });
      return;
    }
    res.json(db.getStashVersions(req.params.id));
  });

  // Compare two versions (diff)
  router.get('/:id/versions/diff', requireScope('read'), (req: Request<{ id: string }>, res: Response) => {
    if (!db.stashExists(req.params.id)) {
      res.status(404).json({ error: 'Stash not found' });
      return;
    }
    const v1 = parseInt(req.query.v1 as string, 10);
    const v2 = parseInt(req.query.v2 as string, 10);
    if (!Number.isInteger(v1) || v1 < 1 || !Number.isInteger(v2) || v2 < 1 || v1 === v2) {
      res.status(400).json({ error: 'Provide two different positive version numbers as v1 and v2 query parameters' });
      return;
    }
    const version1 = db.getStashVersion(req.params.id, v1);
    const version2 = db.getStashVersion(req.params.id, v2);
    if (!version1 || !version2) {
      res.status(404).json({ error: 'One or both versions not found' });
      return;
    }
    res.json({ v1: version1, v2: version2 });
  });

  // Get a specific version of a stash
  router.get('/:id/versions/:version', requireScope('read'), (req: Request<{ id: string; version: string }>, res: Response) => {
    const version = parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) {
      res.status(400).json({ error: 'Invalid version number' });
      return;
    }
    const versionData = db.getStashVersion(req.params.id, version);
    if (!versionData) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(versionData);
  });

  // Restore a specific version
  router.post('/:id/versions/:version/restore', requireScope('write'), (req: Request<{ id: string; version: string }>, res: Response) => {
    const version = parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) {
      res.status(400).json({ error: 'Invalid version number' });
      return;
    }
    const source = getAccessSource(req);
    const stash = db.restoreStashVersion(req.params.id, version, source);
    if (!stash) {
      res.status(404).json({ error: 'Stash or version not found' });
      return;
    }
    db.logAccess(stash.id, source, `restore_version:${version}`, req.ip, req.headers['user-agent']);
    res.json(stash);
  });

  // Get single stash
  router.get('/:id', requireScope('read'), (req: Request<{ id: string }>, res: Response) => {
    const stash = db.getStash(req.params.id);
    if (!stash) {
      res.status(404).json({ error: 'Stash not found' });
      return;
    }
    db.logAccess(stash.id, getAccessSource(req), 'read', req.ip, req.headers['user-agent']);
    res.json(stash);
  });

  // Get access log for a stash
  router.get('/:id/access-log', requireScope('read'), (req: Request<{ id: string }>, res: Response) => {
    if (!db.stashExists(req.params.id)) {
      res.status(404).json({ error: 'Stash not found' });
      return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    res.json(db.getAccessLog(req.params.id, limit));
  });

  // Get raw file content
  router.get('/:id/files/:filename/raw', requireScope('read'), (req: Request<{ id: string; filename: string }>, res: Response) => {
    const file = db.getStashFile(req.params.id, req.params.filename);
    if (!file) {
      if (!db.stashExists(req.params.id)) {
        res.status(404).json({ error: 'Stash not found' });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
      return;
    }
    db.logAccess(req.params.id, 'api', `read_file:${file.filename}`, req.ip, req.headers['user-agent']);
    res.type('text/plain').send(file.content);
  });

  // Create stash
  router.post('/', requireScope('write'), (req: Request, res: Response) => {
    const { name, description, tags, metadata, files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'At least one file is required' });
      return;
    }

    for (const file of files) {
      if (!file.filename || typeof file.filename !== 'string') {
        res.status(400).json({ error: 'Each file must have a filename' });
        return;
      }
    }

    const stash = db.createStash({ name, description, tags, metadata, files });
    db.logAccess(stash.id, getAccessSource(req), 'create', req.ip, req.headers['user-agent']);
    res.status(201).json(stash);
  });

  // Update stash
  router.patch('/:id', requireScope('write'), (req: Request<{ id: string }>, res: Response) => {
    const { name, description, tags, metadata, files } = req.body;
    const source = getAccessSource(req);
    const stash = db.updateStash(req.params.id, { name, description, tags, metadata, files }, source);
    if (!stash) {
      res.status(404).json({ error: 'Stash not found' });
      return;
    }
    db.logAccess(stash.id, getAccessSource(req), 'update', req.ip, req.headers['user-agent']);
    res.json(stash);
  });

  // Delete stash
  router.delete('/:id', requireScope('write'), (req: Request<{ id: string }>, res: Response) => {
    const deleted = db.deleteStash(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Stash not found' });
      return;
    }
    res.status(204).send();
  });

  return router;
}
