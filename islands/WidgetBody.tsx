import { useEffect, useState } from "react";

/**
 * "Aktive Projekte" widget body. Fetches the active-project count from the
 * manifest's dataEndpoint (`/projects/summary`). Relative fetch with credentials.
 */
export default function ActiveProjectsCount() {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/projects/summary", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { active: 0 }))
      .then((d) => alive && setActive(Number(d.active ?? 0)))
      .catch(() => alive && setActive(0));
    return () => {
      alive = false;
    };
  }, []);
  return <p className="widget__metric">{active === null ? "…" : active}</p>;
}
