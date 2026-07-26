import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";

interface Milestone {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "completed";
  due_date: string | null;
}

interface Project {
  id: number;
  customer_id: number;
  title: string;
  status: string;
  start_date: string | null;
  target_date: string | null;
  milestones?: Milestone[];
}

const P_STATUS = ["discovery", "in_progress", "review", "delivered", "on_hold"] as const;
const M_STATUS = ["pending", "in_progress", "completed"] as const;
const P_LABEL: Record<string, string> = { discovery: "Analyse", in_progress: "In Arbeit", review: "Abnahme", delivered: "Abgeschlossen", on_hold: "Pausiert" };
const M_LABEL: Record<string, string> = { pending: "Offen", in_progress: "In Arbeit", completed: "Erledigt" };

// Status -> shared chip variant. Mapped EXPLICITLY rather than interpolated:
// the old code wrote `badge badge--${status}`, and neither `.badge` nor any
// `badge--*` rule exists anywhere, so every one of these labels rendered
// unstyled. Tailwind also cannot extract an interpolated class name.
const P_CHIP: Record<string, string> = {
  discovery: "chip--info",
  in_progress: "chip--warning",
  review: "chip--cat-violet",
  delivered: "chip--success",
  on_hold: "chip--neutral",
};
const M_CHIP: Record<string, string> = {
  pending: "chip--neutral",
  in_progress: "chip--warning",
  completed: "chip--success",
};

const api = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });

const emptyProject = () => ({ title: "", customer_id: "", status: "discovery", start_date: "", target_date: "", description: "" });

/**
 * Owner project management (admin-only, gated by projects:manage). Lists all
 * projects across companies and drives the admin CRUD routes in ProjectsModule:
 * create/edit/delete projects and their milestones. Renders in the admin product
 * only (customers lack projects:manage, so the nav/route is hidden for them).
 */
export default function ProjectsAdmin() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProject());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msDraft, setMsDraft] = useState<Record<number, string>>({});

  const load = () =>
    api("/admin/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setError("Projekte konnten nicht geladen werden."));

  useEffect(() => {
    void load();
  }, []);

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || (!editingId && !String(form.customer_id).trim())) return;
    setBusy(true);
    try {
      const path = editingId ? `/admin/projects/${editingId}` : "/admin/projects";
      const r = await api(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify({ ...form, customer_id: Number(form.customer_id) }) });
      if (!r.ok) throw new Error(String(r.status));
      setForm(emptyProject());
      setEditingId(null);
      await load();
    } catch {
      setError("Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function editProject(p: Project) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      customer_id: String(p.customer_id),
      status: p.status,
      start_date: p.start_date ?? "",
      target_date: p.target_date ?? "",
      description: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteProject(id: number) {
    if (!window.confirm("Projekt wirklich löschen? Meilensteine werden mitgelöscht.")) return;
    await api(`/admin/projects/${id}`, { method: "DELETE" });
    await load();
  }

  async function addMilestone(projectId: number) {
    const title = (msDraft[projectId] ?? "").trim();
    if (!title) return;
    await api(`/admin/projects/${projectId}/milestones`, { method: "POST", body: JSON.stringify({ title }) });
    setMsDraft((d) => ({ ...d, [projectId]: "" }));
    await load();
  }

  async function cycleMilestone(m: Milestone) {
    const next = M_STATUS[(M_STATUS.indexOf(m.status) + 1) % M_STATUS.length];
    await api(`/admin/milestones/${m.id}`, { method: "PATCH", body: JSON.stringify({ title: m.title, status: next, due_date: m.due_date }) });
    await load();
  }

  async function deleteMilestone(id: number) {
    await api(`/admin/milestones/${id}`, { method: "DELETE" });
    await load();
  }

  if (error && projects === null) return <p className="error">{error}</p>;
  if (projects === null) return <p role="status"><Spinner /></p>;

  return (
    <div className="projects-admin">
      {error && <p className="error">{error}</p>}

      <form className="projects-admin__form tds-card" onSubmit={saveProject}>
        <h3>{editingId ? `Projekt #${editingId} bearbeiten` : "Neues Projekt"}</h3>
        <div className="grid">
          <label>Titel<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required /></label>
          <label>Kunde (customer_id)<input type="number" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} disabled={editingId !== null} required={!editingId} /></label>
          <label>Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {P_STATUS.map((s) => <option key={s} value={s}>{P_LABEL[s]}</option>)}
            </select>
          </label>
          <label>Start<input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <label>Ziel<input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></label>
        </div>
        <label>Beschreibung<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
        <div className="projects-admin__actions">
          <button type="submit" disabled={busy}>{editingId ? "Speichern" : "Anlegen"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyProject()); }}>Abbrechen</button>}
        </div>
      </form>

      {projects.length === 0 ? (
        <p className="muted">Noch keine Projekte.</p>
      ) : (
        <ul className="projects-admin__list">
          {projects.map((p) => (
            <li key={p.id} className="tds-card">
              <header>
                <strong>{p.title}</strong>
                <span className={`chip ${P_CHIP[p.status] ?? "chip--neutral"}`}>{P_LABEL[p.status] ?? p.status}</span>
                <span className="muted">Kunde #{p.customer_id}</span>
                <span className="spacer" />
                <button type="button" onClick={() => editProject(p)}>Bearbeiten</button>
                <button type="button" className="btn btn-danger" onClick={() => deleteProject(p.id)}>Löschen</button>
              </header>
              <div className="projects-admin__milestones">
                <ol>
                  {(p.milestones ?? []).map((m) => (
                    <li key={m.id}>
                      <button type="button" className={`chip ${M_CHIP[m.status] ?? "chip--neutral"}`} onClick={() => cycleMilestone(m)} title="Status wechseln">{M_LABEL[m.status]}</button>
                      <span>{m.title}</span>
                      <button type="button" className="link-danger" onClick={() => deleteMilestone(m.id)}>×</button>
                    </li>
                  ))}
                </ol>
                <div className="projects-admin__ms-add">
                  <input
                    value={msDraft[p.id] ?? ""}
                    onChange={(e) => setMsDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder="Meilenstein hinzufügen …"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addMilestone(p.id); } }}
                  />
                  <button type="button" onClick={() => addMilestone(p.id)}>+</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
