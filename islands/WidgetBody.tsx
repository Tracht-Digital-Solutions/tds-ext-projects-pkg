import { SummaryMetric } from "@tracht-digital-solutions/tds-shared/components";

/** "Aktive Projekte" widget body — the active-project count from `/projects/summary`. */
export default function ActiveProjectsCount() {
  return <SummaryMetric<{ active?: number }> endpoint="/projects/summary" value={(d) => Number(d.active ?? 0)} />;
}
