import { useEffect, useState } from "react";
import { Alert, Spinner, StatusChip } from "@tracht-digital-solutions/tds-shared/components";
import { formatDate } from "@tracht-digital-solutions/tds-shared/format";
import { MILESTONE_STATUS, PROJECT_STATUS } from "./statuses";
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";
import {
  AnimatedItem,
  AnimatedList,
  Collapse,
} from "@tracht-digital-solutions/tds-shared/motion/react";

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
    apiFetch("/projects")
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
      const r = await apiFetch(`/projects/${id}`);
      const d = r.ok ? await r.json() : { milestones: [] };
      setMilestones(d.milestones ?? []);
    } catch {
      setMilestones([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  if (forbidden) return <p className="marginalia">Kein Zugriff auf Projekte.</p>;
  if (error && projects === null) return <Alert>{error}</Alert>;
  if (projects === null) return <p><Spinner /></p>;
  if (projects.length === 0) return <p className="marginalia">Noch keine Projekte.</p>;

  // Each project is a card. The old `project-card project-card--${p.status}`
  // matched no rule and nothing referenced the modifier, so it is dropped in
  // favour of the shared `.tds-card` surface (whose radius follows the surface
  // layer). Note: a JSX comment cannot go inside the .map() return position —
  // it is an expression, not JSX children.
  return (
    <AnimatedList className="project-list">
      {projects.map((p) => (
        <AnimatedItem key={p.id} className="tds-card">
          <button type="button" className="btn btn-ghost tds-row tds-row--between" onClick={() => toggle(p.id)} aria-expanded={openId === p.id}>
            <span className="project-card__title">{p.title}</span>
            <StatusChip status={p.status} map={PROJECT_STATUS} />
          </button>
          <Collapse open={openId === p.id}>
            <div className="tds-stack">
              {p.description && <p className="project-card__desc">{p.description}</p>}
              <dl className="project-card__dates">
                <div><dt>Start</dt><dd>{formatDate(p.start_date)}</dd></div>
                <div><dt>Ziel</dt><dd>{formatDate(p.target_date)}</dd></div>
              </dl>
              <h4>Meilensteine</h4>
              {loadingDetail ? (
                <p><Spinner /></p>
              ) : milestones.length === 0 ? (
                <p className="marginalia">Keine Meilensteine.</p>
              ) : (
                <AnimatedList as="ol" className="tds-list">
                  {milestones.map((m) => (
                    <AnimatedItem key={m.id} className="tds-list__row">
                      <span className="milestone__title">{m.title}</span>
                      <StatusChip status={m.status} map={MILESTONE_STATUS} />
                      <time>{formatDate(m.due_date)}</time>
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              )}
            </div>
          </Collapse>
        </AnimatedItem>
      ))}
    </AnimatedList>
  );
}
