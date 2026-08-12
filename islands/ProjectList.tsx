import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";

interface Project {
  id: number;
  title: string;
  status: string;
  start_date: string | null;
  target_date: string | null;
  description: string;
}

interface Milestone {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "completed";
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
}

const STATUS_LABEL: Record<string, string> = {
  discovery: "Analyse",
  in_progress: "In Arbeit",
  review: "Abnahme",
  delivered: "Abgeschlossen",
  on_hold: "Pausiert",
};
const M_STATUS_LABEL: Record<string, string> = {
  pending: "Offen",
  in_progress: "In Arbeit",
  completed: "Erledigt",
};

// Status -> shared chip variant. Mapped EXPLICITLY, not interpolated: the old
// code wrote `badge badge--${status}`, and neither `.badge` nor any `badge--*`
// rule exists anywhere, so every status label rendered unstyled. Kept in sync
// with the identical maps in ProjectsAdmin.tsx.
const STATUS_CHIP: Record<string, string> = {
  discovery: "chip--info",
  in_progress: "chip--warning",
  review: "chip--cat-violet",
  delivered: "chip--success",
  on_hold: "chip--neutral",
};
const M_STATUS_CHIP: Record<string, string> = {
  pending: "chip--neutral",
  in_progress: "chip--warning",
  completed: "chip--success",
};

const api = apiFetch;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/**
 * Portal project directory (ported from tds-customer-legacy-frontend's project
 * views). List of the company's projects; selecting one loads its detail +
 * milestone timeline. Read-only — owner management lives in the admin product.
 */
export default function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api("/projects")
      .then((r) => {
        if (r.status === 403) {
          setForbidden(true);
          return { projects: [] };
        }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setError("Projekte konnten nicht geladen werden."));
  }, []);

  async function toggle(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLoadingDetail(true);
    try {
      const r = await api(`/projects/${id}`);
      const d = r.ok ? await r.json() : { milestones: [] };
      setMilestones(d.milestones ?? []);
    } catch {
      setMilestones([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  if (forbidden) return <p className="marginalia">Kein Zugriff auf Projekte.</p>;
  if (error && projects === null) return <p className="tds-alert tds-alert--danger" role="alert">{error}</p>;
  if (projects === null) return <p><Spinner /></p>;
  if (projects.length === 0) return <p className="marginalia">Noch keine Projekte.</p>;

  // Each project is a card. The old `project-card project-card--${p.status}`
  // matched no rule and nothing referenced the modifier, so it is dropped in
  // favour of the shared `.tds-card` surface (whose radius follows the surface
  // layer). Note: a JSX comment cannot go inside the .map() return position —
  // it is an expression, not JSX children.
  return (
    <ul className="project-list">
      {projects.map((p) => (
        <li key={p.id} className="tds-card">
          <button type="button" className="btn btn-ghost tds-row tds-row--between" onClick={() => toggle(p.id)} aria-expanded={openId === p.id}>
            <span className="project-card__title">{p.title}</span>
            <span className={`chip ${STATUS_CHIP[p.status] ?? "chip--neutral"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
          </button>
          {openId === p.id && (
            <div className="tds-stack">
              {p.description && <p className="project-card__desc">{p.description}</p>}
              <dl className="project-card__dates">
                <div><dt>Start</dt><dd>{fmtDate(p.start_date)}</dd></div>
                <div><dt>Ziel</dt><dd>{fmtDate(p.target_date)}</dd></div>
              </dl>
              <h4>Meilensteine</h4>
              {loadingDetail ? (
                <p><Spinner /></p>
              ) : milestones.length === 0 ? (
                <p className="marginalia">Keine Meilensteine.</p>
              ) : (
                <ol className="tds-list">
                  {milestones.map((m) => (
                    <li key={m.id} className="tds-list__row">
                      <span className="milestone__title">{m.title}</span>
                      <span className={`chip ${M_STATUS_CHIP[m.status] ?? "chip--neutral"}`}>{M_STATUS_LABEL[m.status] ?? m.status}</span>
                      <time>{fmtDate(m.due_date)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
