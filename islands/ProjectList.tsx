import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";

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

const api = (path: string, init?: RequestInit) => fetch(path, { credentials: "include", ...init });
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

  if (forbidden) return <p className="muted">Kein Zugriff auf Projekte.</p>;
  if (error && projects === null) return <p className="error">{error}</p>;
  if (projects === null) return <p role="status"><Spinner /></p>;
  if (projects.length === 0) return <p className="muted">Noch keine Projekte.</p>;

  return (
    <ul className="project-list">
      {projects.map((p) => (
        <li key={p.id} className={`project-card project-card--${p.status}`}>
          <button type="button" className="project-card__head" onClick={() => toggle(p.id)} aria-expanded={openId === p.id}>
            <span className="project-card__title">{p.title}</span>
            <span className={`badge badge--${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
          </button>
          {openId === p.id && (
            <div className="project-card__detail">
              {p.description && <p className="project-card__desc">{p.description}</p>}
              <dl className="project-card__dates">
                <div><dt>Start</dt><dd>{fmtDate(p.start_date)}</dd></div>
                <div><dt>Ziel</dt><dd>{fmtDate(p.target_date)}</dd></div>
              </dl>
              <h4>Meilensteine</h4>
              {loadingDetail ? (
                <p role="status"><Spinner /></p>
              ) : milestones.length === 0 ? (
                <p className="muted">Keine Meilensteine.</p>
              ) : (
                <ol className="milestone-list">
                  {milestones.map((m) => (
                    <li key={m.id} className={`milestone milestone--${m.status}`}>
                      <span className="milestone__title">{m.title}</span>
                      <span className={`badge badge--${m.status}`}>{M_STATUS_LABEL[m.status] ?? m.status}</span>
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
