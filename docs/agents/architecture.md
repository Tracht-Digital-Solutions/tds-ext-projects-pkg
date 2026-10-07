# Architecture

## Backend

`php/src/ProjectsModule.php` (namespace `Tds\Ext\Projects`) extends `AbstractModule`.
Data goes through the core's shared `PDO`; the repository lives in `php/src/Domain/`.

| Route | Gate | Purpose |
|---|---|---|
| `GET /projects/summary` | `projects:read` | Widget count |
| `GET /projects` | `projects:read` | Portal list, scoped to the active company |
| `GET /projects/{id:[0-9]+}` | `projects:read` | Project detail with milestones |
| `GET /admin/projects` | admin | Owner list |
| `POST /admin/projects` | admin | Create |
| `PATCH /admin/projects/{id:[0-9]+}` | admin | Update |
| `DELETE /admin/projects/{id:[0-9]+}` | admin | Delete; cascades to milestones |
| `POST /admin/projects/{id:[0-9]+}/milestones` | admin | Add milestone |
| `PATCH /admin/milestones/{id:[0-9]+}` | admin | Update milestone (replaces the row) |
| `DELETE /admin/milestones/{id:[0-9]+}` | admin | Delete milestone |

- Auth is the core `UserContext`, scoped by `activeCompanyId()`. Admins bypass
  permission checks; `/admin/*` routes are `isAdmin`-gated on the backend.
- A non-admin without an active company has no scope (the summary returns 0).

## Data model

- Tables `projects_project` and `projects_milestone`; migration `CreateProjectsProject`
  (`20260722000002`).
- **No customer foreign key.** Customers live in another domain, so `customer_id` is a
  loose unsigned reference to the JWT's active company id.

## Frontend

| Surface | Files | Permission |
|---|---|---|
| Portal `/projects` (read-only) | `islands/ProjectList.tsx`, `pages/Index.astro` | `projects:read` |
| Owner `/admin/projects` (nav "Projekte verwalten") | `islands/ProjectsAdmin.tsx`, `pages/AdminIndex.astro` | `projects:manage` |
| Widget (active projects) | `islands/WidgetBody.tsx` | `projects:read` |

No customer holds `projects:manage`, so the admin view is injected into both products
but effectively admin-only. The nav entry must be gated on `manage` too; a nav entry gated
on `read` puts the owner link into a customer's sidebar.

### Owner view rules

- **An edit PATCHes; only a create POSTs.** A POST while editing duplicates the project.
- **`customer_id` is locked once the project exists.** Re-homing a project would move its
  milestones away from the customer who can see them.
- Deleting a project or milestone goes through `<ConfirmDialog>`. Declining sends nothing.
- The milestone status **cycles** `pending` → `in_progress` → `completed` → `pending`. The wrap is the
  only way to correct a milestone marked done by mistake. The PATCH carries title and due
  date, since it replaces the row.
- The milestone draft is cleared only after the POST succeeded.

### Portal view rules

The accordion must be honest: the detail belongs to the project that was opened, only one
card is expanded at a time, and a failed detail request renders an **empty** timeline,
never the previous project's.

### Motion

From `tds-shared/motion/react` (peer `>=0.38.7`): a project card opens with `Collapse`;
cards are `AnimatedItem`s so the ones below move instead of jumping; milestones and the
admin list are `AnimatedList`s; the admin form cross-fades between "Neues Projekt" and
"Projekt bearbeiten". Collapsed or swapped content stays in the DOM briefly
(`aria-hidden` + `inert`), so tests use `findBy…` for what appears and `waitFor` for what
leaves.
