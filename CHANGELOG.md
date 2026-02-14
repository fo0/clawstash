# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-02-11

### Added

- Multi-file stash storage with name, description, tags, and key-value metadata
- REST API with full CRUD operations and Bearer token authentication
- MCP server with Streamable HTTP and stdio transports for AI agent integration
- Token-efficient MCP tools: selective file access, summary-only listings, confirmation-only writes
- Web GUI with dark theme, card/list views, syntax highlighting (30+ languages)
- Full-text search across stash names, descriptions, filenames, and file content
- Tag combobox with auto-complete and free-form creation
- Metadata key-value editor with key suggestions and expand/collapse
- URL routing with deep links to individual stashes (`/stash/:id`)
- Auto-filename: first file inherits stash name during creation
- Access log tracking for API, MCP, and UI access
- Password-based admin login with configurable session duration
- API token management with scopes (Read, Write, Admin, MCP)
- Settings area with API management, Swagger UI explorer, storage statistics
- OpenAPI 3.0 schema and MCP specification endpoints
- Docker support with multi-stage builds and GitHub Actions CI/CD
- One-click copy for files, API endpoints, and spec documents
