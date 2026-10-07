# AGENTS.md — tds-ext-projects-pkg

Frontend extension for the customer↔owner project directory: a read-only portal view of
projects and milestones for customers, and an admin CRUD view for the owner. It
contributes a PHP `Module` to `tds-core-frontend-api` and routes, nav entries and a widget
to the panel products. Composed at build time.

Read `tds-frontend-contract-pkg/AGENTS.md` first (extension contract).
`tds-ext-support-tickets-pkg` is the reference full port; this extension has the same shape.

## Commands

```bash
npm install --no-package-lock   # never npm ci
npm run type-check
npm run lint:primitives
npm run test:run                # vitest
npm run build                   # tsup
composer install && composer test   # phpunit
```

## Hard rules

- Two gating levels: `/admin/projects` (route **and** nav) needs `projects:manage`; the portal needs `projects:read`.
- An edit PATCHes; only a create POSTs. `customer_id` is locked once a project exists.
- Deletes go through `<ConfirmDialog>`; declining sends nothing.
- Every mutation checks its response and reports via toast. Never mount a `ToastHost`.
- Call the API with `apiFetch`, never a relative `fetch`.
- Every route change updates `php/docs/api.php`. Migration names stay unique across extensions.
- No CSS; shared `tds-shared` classes only. Versions move via the release workflow only.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Changing routes, permissions, the data model or islands |
| [docs/agents/backend.md](docs/agents/backend.md) | Touching PHP, migrations or `php/docs/api.php` |
| [docs/agents/frontend-conventions.md](docs/agents/frontend-conventions.md) | Touching any island, page or widget markup |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests |
| [docs/agents/release.md](docs/agents/release.md) | Releasing or changing CI |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.
