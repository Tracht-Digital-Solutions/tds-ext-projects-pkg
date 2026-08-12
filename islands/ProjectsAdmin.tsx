import { useEffect, useState } from "react";
import { ConfirmDialog, Spinner, toast } from "@tracht-digital-solutions/tds-shared/components";
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";

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
  apiFetch(path, { headers: { "Content-Type": "application/json" }, ...init });

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
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [pendingMilestone, setPendingMilestone] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () =>
    api("/admin/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setError("Projekte konnten nicht geladen werden."));

  useEffect(() => {
    void load();
  }, []);

  async function saveProject(e: React.SubmitEvent) {
    e.preventDefault();
    if (!form.title.trim() || (!editingId && !String(form.customer_id).trim())) return;
    setBusy(true);
    try {
      const path = editingId ? `/admin/projects/${editingId}` : "/admin/projects";
      const r = await api(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify({ ...form, customer_id: Number(form.customer_id) }) });
      if (!r.ok) throw new Error(String(r.status));
      const wasEditing = editingId !== null;
      setForm(emptyProject());
      setEditingId(null);
      await load();
      toast.success(wasEditing ? "Projekt gespeichert." : "Projekt angelegt.");
    } catch (e) {
      // `error` stays reserved for the LOAD failure (a persistent state that
      // replaces the whole list); a failed save is transient and belongs in a
      // toast, next to the form the user is still looking at.
      toast.danger(`Speichern fehlgeschlagen (HTTP ${e instanceof Error ? e.message : "?"}).`);
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

  // The four mutations below used to ignore their responses completely, so a
  // 403 or a 500 looked exactly like success: the dialog closed, the draft
  // cleared, the list reloaded — and the row was simply still there.
  async function confirmDeleteProject() {
    const p = pendingDelete;
    if (!p) return;
    setDeleting(true);
    try {
      const r = await api(`/admin/projects/${p.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
      if (r.ok) toast.success(`„${p.title}" gelöscht.`);
      else toast.danger(`Löschen fehlgeschlagen (HTTP ${r.status}).`);
    } catch {
      setPendingDelete(null);
      toast.danger("Löschen fehlgeschlagen — die API ist nicht erreichbar.");
    } finally {
      setDeleting(false);
    }
  }

  async function addMilestone(projectId: number) {
    const title = (msDraft[projectId] ?? "").trim();
    if (!title) return;
    try {
      const r = await api(`/admin/projects/${projectId}/milestones`, { method: "POST", body: JSON.stringify({ title }) });
      if (r.ok) {
        // Only clear the draft once it is actually stored — otherwise a failed
        // add silently eats what the user typed.
        setMsDraft((d) => ({ ...d, [projectId]: "" }));
        toast.success("Meilenstein hinzugefügt.");
      } else {
        toast.danger(`Meilenstein konnte nicht angelegt werden (HTTP ${r.status}).`);
      }
    } catch {
      toast.danger("Meilenstein konnte nicht angelegt werden — die API ist nicht erreichbar.");
    } finally {
      await load();
    }
  }

  async function cycleMilestone(m: Milestone) {
    const next = M_STATUS[(M_STATUS.indexOf(m.status) + 1) % M_STATUS.length];
    try {
      const r = await api(`/admin/milestones/${m.id}`, { method: "PATCH", body: JSON.stringify({ title: m.title, status: next, due_date: m.due_date }) });
      // Success is silent on purpose: the status chip itself changes after the
      // reload, so a toast would only repeat what the user can already see.
      if (!r.ok) toast.danger(`Status konnte nicht geändert werden (HTTP ${r.status}).`);
    } catch {
      toast.danger("Status konnte nicht geändert werden — die API ist nicht erreichbar.");
    } finally {
      await load();
    }
  }

  // The trigger is a bare „×" beside the milestone title — precisely the control
  // a misclick lands on — so it is gated too, not just the big Löschen button.
  async function confirmDeleteMilestone() {
    const m = pendingMilestone;
    if (!m) return;
    setDeleting(true);
    try {
      const r = await api(`/admin/milestones/${m.id}`, { method: "DELETE" });
      setPendingMilestone(null);
      await load();
      if (r.ok) toast.success("Meilenstein gelöscht.");
      else toast.danger(`Löschen fehlgeschlagen (HTTP ${r.status}).`);
    } catch {
      setPendingMilestone(null);
      toast.danger("Löschen fehlgeschlagen — die API ist nicht erreichbar.");
    } finally {
      setDeleting(false);
    }
  }

  if (error && projects === null) return <p className="tds-alert tds-alert--danger" role="alert">{error}</p>;
  if (projects === null) return <p><Spinner /></p>;

  return (
    <div className="tds-stack">
      {error && <p className="tds-alert tds-alert--danger" role="alert">{error}</p>}

      <form className="tds-stack tds-card" onSubmit={saveProject}>
        <h3>{editingId ? `Projekt #${editingId} bearbeiten` : "Neues Projekt"}</h3>
        {/* A bare `grid` is one implicit column, so these five fields stacked
            at every width — right on a phone, wasteful on a desktop. The
            `sm:` prefix is what keeps the phone behaviour unchanged. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="tds-field-row">Titel<input className="field-boxed" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required /></label>
          <label className="tds-field-row">Kunde (customer_id)<input className="field-boxed" type="number" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} disabled={editingId !== null} required={!editingId} /></label>
          <label className="tds-field-row">Status
            <select className="field-boxed" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {P_STATUS.map((s) => <option key={s} value={s}>{P_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="tds-field-row">Start<input className="field-boxed" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <label className="tds-field-row">Ziel<input className="field-boxed" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></label>
        </div>
        <label className="tds-field-row">Beschreibung<textarea className="field-boxed" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
        <div className="tds-toolbar">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{editingId ? "Speichern" : "Anlegen"}</button>
          {editingId && <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(emptyProject()); }}>Abbrechen</button>}
        </div>
      </form>

      {projects.length === 0 ? (
        <p className="tds-empty">Noch keine Projekte.</p>
      ) : (
        <ul className="tds-list">
          {projects.map((p) => (
            <li key={p.id} className="tds-card">
              {/* `.tds-row tds-row--between` — a bare <header> is display:block,
                  so the title, chip, customer and both buttons reflowed as
                  inline text and `.spacer` (a class nothing defines) pushed
                  nothing anywhere. The shared row wraps, so the buttons drop
                  to their own line on a phone instead of running into the
                  title. */}
              <header className="tds-row tds-row--between">
                <strong>{p.title}</strong>
                <span className={`chip ${P_CHIP[p.status] ?? "chip--neutral"}`}>{P_LABEL[p.status] ?? p.status}</span>
                <span className="marginalia">Kunde #{p.customer_id}</span>
                <span className="tds-toolbar">
                  <button type="button" className="btn btn-ghost" onClick={() => editProject(p)}>Bearbeiten</button>
                  <button type="button" className="btn btn-danger" onClick={() => setPendingDelete(p)}>Löschen</button>
                </span>
              </header>
              <div className="tds-stack">
                <ol>
                  {(p.milestones ?? []).map((m) => (
                    <li key={m.id}>
                      <button type="button" className={`chip ${M_CHIP[m.status] ?? "chip--neutral"}`} onClick={() => cycleMilestone(m)} title="Status wechseln">{M_LABEL[m.status]}</button>
                      <span>{m.title}</span>
                      <button type="button" className="btn btn-danger" onClick={() => setPendingMilestone(m)} aria-label="Meilenstein löschen">×</button>
                    </li>
                  ))}
                </ol>
                <div className="tds-toolbar">
                  <input
                    className="field-boxed"
                    aria-label="Neuer Meilenstein"
                    value={msDraft[p.id] ?? ""}
                    onChange={(e) => setMsDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder="Meilenstein hinzufügen …"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addMilestone(p.id); } }}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => addMilestone(p.id)} aria-label="Meilenstein hinzufügen">+</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingMilestone !== null}
        title={`Meilenstein „${pendingMilestone?.title ?? ""}“ löschen?`}
        busy={deleting}
        onConfirm={() => void confirmDeleteMilestone()}
        onCancel={() => setPendingMilestone(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Projekt „${pendingDelete?.title ?? ""}“ löschen?`}
        message="Alle Meilensteine des Projekts werden mitgelöscht."
        busy={deleting}
        onConfirm={() => void confirmDeleteProject()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
