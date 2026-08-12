import { useEffect, useState } from "react";
import { Skeleton } from "@tracht-digital-solutions/tds-shared/components";
import { apiFetch } from "@tracht-digital-solutions/tds-shared/api";

/**
 * "Aktive Projekte" widget body. Fetches the active-project count from the
 * manifest's dataEndpoint (`/projects/summary`). Relative fetch with credentials.
 */
export default function ActiveProjectsCount() {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch("/projects/summary")
      .then((r) => (r.ok ? r.json() : { active: 0 }))
      .then((d) => alive && setActive(Number(d.active ?? 0)))
      .catch(() => alive && setActive(0));
    return () => {
      alive = false;
    };
  }, []);
  return <p className="tds-widget__metric" aria-busy={active === null}>
      {active === null ? <Skeleton width="3ch" height="1.75rem" /> : active}
    </p>;
}
