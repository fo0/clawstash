import { Router, Request, Response } from 'express';
import { ClawStashDB, TokenScope } from '../db.js';
import { requireAdminAuth } from '../auth.js';

const VALID_SCOPES: TokenScope[] = ['read', 'write', 'admin', 'mcp'];

function isValidScope(scope: string): scope is TokenScope {
  return VALID_SCOPES.includes(scope as TokenScope);
}

export function createTokenRouter(db: ClawStashDB): Router {
  const router = Router();

  function checkAdmin(req: Request, res: Response): boolean {
    const auth = requireAdminAuth(db, req);
    if (auth) return true;

    const hasToken = !!req.headers.authorization || !!req.query.token;
    if (!hasToken) {
      res.status(401).json({ error: 'Authorization required' });
    } else {
      res.status(403).json({ error: 'Admin access required' });
    }
    return false;
  }

  // List tokens
  router.get('/', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;
    const tokens = db.listApiTokens();
    res.json({ tokens });
  });

  // Create token
  router.post('/', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;

    const { label, scopes } = req.body;

    if (scopes && !Array.isArray(scopes)) {
      res.status(400).json({ error: 'Scopes must be an array' });
      return;
    }

    const resolvedScopes: TokenScope[] = scopes && scopes.length > 0
      ? scopes.filter((s: string) => isValidScope(s))
      : ['read'];

    if (resolvedScopes.length === 0) {
      res.status(400).json({ error: 'At least one valid scope is required' });
      return;
    }

    const result = db.createApiToken(
      typeof label === 'string' ? label.trim() : '',
      resolvedScopes,
    );

    res.status(201).json(result);
  });

  // Delete token
  router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    if (!checkAdmin(req, res)) return;

    const deleted = db.deleteApiToken(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    res.status(204).send();
  });

  // Validate a token (for testing)
  router.post('/validate', (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      res.json({ valid: false, scopes: [] });
      return;
    }
    const token = auth.substring(7);
    const result = db.validateApiToken(token);
    res.json({ valid: result.valid, scopes: result.scopes });
  });

  return router;
}
