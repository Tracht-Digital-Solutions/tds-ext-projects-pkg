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

- **Call the API with `apiFetch` from `@tracht-digital-solutions/tds-shared/api`,
  never a relative `fetch`.** Every island used to define its own
  `const api = (path, init) => fetch(path, { credentials: "include", ...init })`
  with a RELATIVE path. In a product that resolves against the product's own
  static host (`management.`/`app.tracht-digital.de`), not the API — and the
  static host answers unknown paths with its SPA fallback, i.e. **200 + HTML**.
  So `res.ok` is `true`, `res.json()` throws, and the usual
  `.catch(() => setRows([]))` renders a calm, permanent empty state with no
  error and no console warning. `apiFetch` resolves the base from
  `<meta name="tds-api-base">` (written by the frontend host) and routes 401s
  through the host's confirm-against-`/me` backstop, which extension calls
  previously skipped entirely.
  The island tests match on the request PATH (`pathOf()`), which a relative
  fetch satisfies just as well — so one assertion per suite pins the **absolute
  host**. That is the line that fails if this ever regresses.


- **No customer/project FK** — those entities live in another domain (auth /
  customer management), so `customer_id`/`project_id` are loose unsigned refs;
  `customer_id` = the JWT active company id (nullable = admin all-company view).
- **Mutations report their outcome via `toast` (tds-shared `>=0.16.0`).** All four
  admin mutations — delete project, add/cycle/delete milestone — used to ignore
  their response, so a 403 looked exactly like success: the dialog closed, the
  draft cleared, the list reloaded, and the row was simply still there. The
  milestone draft is now only cleared once the POST succeeded. `error` state
  stays reserved for the LOAD failure (a persistent state that replaces the
  list); transient outcomes are toasts. Never mount a `ToastHost` here — the
  frontend host owns the only one.
- **Migration class name AND numeric prefix are extension-unique** (shared phinxlog
  across all composed extensions): `CreateProjectsMessage`, `20260722000001`.
- **Depends on the published contract** VCS-only (Composer `type:vcs`), npm `^1.0.0`
  from GitHub Packages — never a `path` repo.
- **Extension routes are Layout-wrapped by the host** (`panelHost({ layout })`); the
  page renders only its `<section>`, never a full `<html>`.

## Admin management view

- **`/admin/projects`** (nav "Projekte verwalten") is the owner CRUD UI
  (`islands/ProjectsAdmin.tsx` + `pages/AdminIndex.astro`), gated by the
  **`projects:manage`** permission. No customer holds it, so only admins (who
  bypass permission checks) see the nav/route — it's injected into both products
  but effectively admin-only. It drives the module's `/admin/projects` +
  `/admin/*/milestones` CRUD routes (all `isAdmin`-gated on the backend). The
  customer `/projects` view stays read-only.

## Tests (frontend)
- **CI runs `test:run` since 2026-08-25 — before that, none of these suites
  ever ran on a runner.** `_build.yml` had type-check, lint:primitives and
  build. That included the `ApiDocSource` parity test, whose entire job is to
  fail when a route gains or loses documentation.
- **The suites used to run against a tds-shared a dozen minors old, and the
  first honest run cost 30 failures across the twelve shipping extensions.**
  This package declares tds-shared as a **peer** with a `>=0.19.0` floor, so a
  fresh install resolved 0.19.0 while every product build composes the current
  one. Three separate behaviours had moved underneath the tests, and each is
  worth knowing because a new suite will hit them again:
  - `apiFetch` consults the host-side runtime config (`/tds-runtime.json`)
    before it resolves a URL, so `fetch.mock.calls[0]` is that probe, not the
    endpoint. Call **`primeRuntimeConfig(null)`** in `beforeEach` — the panel
    products never ship that file (they render `<meta name="tds-api-base">`),
    so "absent" is also what happens in production.
  - `apiFetch` is **async**: the request leaves on a later microtask than the
    render. Reading `mock.calls` on the line after `render(...)` yields
    `undefined`; `await waitFor(() => expect(fetch).toHaveBeenCalled())` first.
  - A multipart upload now carries an **empty** `headers` object rather than
    `undefined`. Identical to the browser — the boundary is still the
    browser's to set — so assert "no content-type header", never
    "headers is undefined".


```bash
npm run test:run    # vitest, 127 tests (jsdom per-file via a @vitest-environment docblock)
```

- `islands/ProjectsAdmin.test.tsx` — the owner surface. Three things get the
  sharpest assertions:
  - **deleting a project is gated behind `window.confirm`** and cascades to its
    milestones. Declining must send NOTHING — the only guard in front of an
    irreversible multi-row delete.
  - **an edit PATCHes; only a create POSTs.** A POST while editing duplicates
    the project instead of updating it.
  - **`customer_id` is locked once the project exists.** Re-homing a project
    would move its milestones out from under the customer who can see them.
  The milestone status **cycle** is pinned in all three steps *including the
  wrap* from `completed` back to `pending` — that wrap is the only way to
  correct a milestone marked done by mistake — and the PATCH is asserted to
  carry the title and due date through, since it replaces the row.
- `islands/ProjectList.test.tsx` — the read-only portal view. The accordion has
  to be honest: the detail belongs to the project that was opened (a stale
  milestone list would show one project's plan under another's heading), only
  one card is expanded at a time, and a failed detail request renders an EMPTY
  timeline rather than the previous project's.
- `islands/WidgetBody.test.tsx` — the active-project tile.
- `src/index.test.ts` + `tests/packaging.test.ts` — the manifest as a product
  build sees it. This extension has **two gating levels**, and the test asserts
  the split in both directions: `/admin/projects` (route AND nav entry) requires
  `projects:manage`, the portal surface `projects:read`. Checking only the route
  is not enough — a nav entry gated on `read` puts the owner link in a
  customer's sidebar even when the page itself is protected.

Error-path tests deliberately answer with a POPULATED body and a non-OK status.
Against an EMPTY error body the ok-check is unobservable.

Verified by mutation: 64 deliberate breakages introduced, **62 caught**. The two
survivors are equivalent mutants, kept as defence in depth:

1. dropping the JS "customer is required" guard — the input carries HTML
   `required` while creating, so the browser blocks the submit first (the
   attribute itself is asserted instead);
2. dropping `e.preventDefault()` in the milestone input's Enter handler — that
   input lives **outside** the project `<form>` (which closes before the list),
   so Enter cannot submit the form either way.

## Mobile layout

This package ships **no CSS**, so every layout decision is a shared class or a
Tailwind utility, and neither is checked by anything at runtime. Two rules:

- **A row of more than two things — or any row holding a full-width field —
  goes on `.tds-row`, `.tds-list__row` or `.tds-toolbar`.** All three wrap.
  A hand-rolled `flex` does not, and on a 375px screen the overflow is not
  even visible: `body { overflow-x: hidden }` clips it, so the content simply
  is not there.
- **A `<table>` needs `tds-table` and nothing else.** The primitive turns
  itself into a horizontal scroller below 40rem; an extra `overflow-x`
  wrapper or an inline style is redundant. A table with no focusable cell
  also needs `tabindex="0"` + `role="region"` + a label, or its scrollport
  cannot be reached by keyboard.

`npm run lint:primitives` enforces the class part of this (including a
`<table>` without `tds-table` and a flex/grid table cell, which silently
drops the cell out of the column algorithm). It is a **regex scan**, so a tag
name written inside a comment counts as markup — name elements in prose.

## API-Referenz (`php/docs/api.php`)

This module implements the contract's optional `ApiDocSource`: `php/docs/api.php`
returns one entry per route (summary, params, responses, required permission),
and the admin frontend's API reference joins it onto the introspected Slim routes
by `"<METHOD> <pattern>"`. Two things to know before editing a route:

- **`pattern` must be the Slim pattern verbatim**, inline regex included
  (`/admin/projects/{id:[0-9]+}/milestones`). A prettified path silently produces an orphan doc *and* an
  undocumented route rather than an error.
- **`php/tests/ProjectsApiDocsTest.php` asserts both directions** — the documented
  set and the registered set must be the same set, every path placeholder must
  be described, and a named permission must exist in `permissions()`. Adding or
  renaming a route without touching `docs/api.php` fails there. That is the
  point: prose next to code rots, and a reference full of confident, wrong
  detail is worse than the bare route list it replaced.
