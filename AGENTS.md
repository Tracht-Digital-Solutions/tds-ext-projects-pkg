# Agent notes — tds-ext-projects

The customer↔owner project directory. Read `tds-frontend-contract-pkg`'s AGENTS.md
first (extension contract) and `tds-ext-support-tickets-pkg` as the reference
full port — this extension follows the same shape.

## Architecture

- **Backend** (`php/src/ProjectsModule.php`, namespace `Tds\Ext\Projects`) — extends
  `AbstractModule`. Routes: `GET /projects` (thread, marks counterpart msgs read),
  `POST /projects`, `PATCH /projects/{id}`, `GET /projects/summary` (widget unread
  count). Auth is entirely the core `UserContext`: `projects:read`/`projects:write`
  (admins bypass), scoped by `activeCompanyId()`. `author_type` = `owner` for admin,
  else `customer`. Data via the core shared `PDO`; repository in `Domain/`.
- **Ownership on edit** — admins edit any project; a customer only their own
  `author_type='customer'` rows scoped to their company (`rowCount()==0` → 404, so
  ids aren't leakable). Ported verbatim from the legacy `Message\UpdateAction`.
- **Frontend** (`src/index.ts` manifest + `pages/Index.astro` + `islands/*`) — nav
  entry, `/projects` route (`MessageThread`), and the `projects-unread` widget.

## Gotchas

- **No customer/project FK** — those entities live in another domain (auth /
  customer management), so `customer_id`/`project_id` are loose unsigned refs;
  `customer_id` = the JWT active company id (nullable = admin all-company view).
- **Migration class name AND numeric prefix are extension-unique** (shared phinxlog
  across all composed extensions): `CreateProjectsMessage`, `20260722000001`.
- **Depends on the published contract** VCS-only (Composer `type:vcs`), npm `^1.0.0`
  from GitHub Packages — never a `path` repo.
- **Extension routes are Layout-wrapped by the host** (`panelHost({ layout })`); the
  page renders only its `<section>`, never a full `<html>`.
