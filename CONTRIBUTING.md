# Contributing to ClawStash

Thanks for your interest in contributing to ClawStash! Here's how to get started.

## Development Setup

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/fo0/clawstash.git
cd clawstash
npm install
npm run dev
```

This starts the Next.js development server on port 3000 with both the frontend and API routes.

## Making Changes

1. Fork the repository and create a feature branch from `main`
2. Make your changes
3. Run the build to verify everything compiles: `npm run build`
4. Commit with a clear, descriptive message
5. Open a pull request against `main`

## Project Structure

- `src/app/` — Next.js App Router (pages, layouts, API route handlers)
- `src/server/` — Server-side logic (database, auth, MCP, OpenAPI)
- `src/components/` — React components organized by feature
- `src/utils/` — Shared utility functions
- `src/hooks/` — Shared React hooks

See `CLAUDE.md` for detailed architecture documentation.

## Code Style

- TypeScript with strict mode
- 2-space indentation, single quotes
- Functional React components with TypeScript interfaces for props
- Global CSS with CSS custom properties (no CSS-in-JS)
- Named imports, `@/*` path aliases for server-side imports

## Reporting Issues

Please use [GitHub Issues](https://github.com/fo0/clawstash/issues) to report bugs or request features. Include:

- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Environment details (Node.js version, OS, browser)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
