import { defineExtension } from "@tracht-digital-solutions/tds-frontend-contract";

/**
 * Projects extension — the customer project + milestone directory, ported from
 * tds-customer-api (project/milestone tables) onto the frontend platform.
 * Customers view their projects and milestone progress (read-only); the owner
 * (admin) manages them. Data lives in this extension's own tables; auth comes
 * from the core UserContext.
 *
 * `projects:read` is the portal permission (view); admin management routes are
 * gated by `isAdmin` (admins bypass all permission checks).
 */
export default defineExtension({
  id: "projects",
  name: "Projekte",
  version: "0.1.0",
  permissions: [
    { id: "projects:read", label: "Projekte ansehen", group: "projects" },
    { id: "projects:manage", label: "Projekte verwalten (Owner)", group: "projects" },
  ],
  nav: [
    {
      id: "projects",
      label: "Projekte",
      href: "/projects",
      icon: "folder-kanban",
      group: "work",
      order: 10,
      permission: "projects:read",
    },
    {
      // Admin-only: gated by projects:manage, which no customer holds — only
      // admins (who bypass permission checks) see the owner management view.
      id: "projects-admin",
      label: "Projekte verwalten",
      href: "/admin/projects",
      icon: "folder-cog",
      group: "verwaltung",
      order: 10,
      permission: "projects:manage",
    },
  ],
  widgets: [
    {
      id: "projects-active",
      title: "Aktive Projekte",
      island: "@tracht-digital-solutions/tds-ext-projects/widgets/Widget.astro",
      size: "sm",
      permission: "projects:read",
      dataEndpoint: "/projects/summary",
      order: 5,
    },
  ],
  routes: [
    {
      pattern: "/projects",
      entrypoint: "@tracht-digital-solutions/tds-ext-projects/pages/Index.astro",
      permission: "projects:read",
    },
    {
      pattern: "/admin/projects",
      entrypoint: "@tracht-digital-solutions/tds-ext-projects/pages/AdminIndex.astro",
      permission: "projects:manage",
    },
  ],
  i18n: {
    de: { "projects.title": "Projekte", "projects.active": "Aktive Projekte" },
    en: { "projects.title": "Projects", "projects.active": "Active projects" },
  },
});
