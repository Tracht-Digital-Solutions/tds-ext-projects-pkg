// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { primeRuntimeConfig } from "@tracht-digital-solutions/tds-shared/api";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectList from "./ProjectList";

/**
 * The portal project directory — read-only; owner management lives in the
 * admin product. A customer opens a project to see its milestone timeline.
 *
 * What matters here is that the accordion is honest: the detail belongs to the
 * project that was opened (a stale milestone list would show one customer's
 * project plan under another project's heading), and `aria-expanded` tracks
 * the real open state.
 *
 * A 403 is its own state, not an error.
 */

interface Reply {
  status: number;
  body: unknown;
}
type Handler = (url: string, init?: RequestInit) => Reply | undefined;

let calls: Array<{ url: string; method: string }> = [];
let handlers: Handler[] = [];
let gate: { match: RegExp; promise: Promise<void> } | null = null;


/**
 * Path + query of a request. The island calls an ABSOLUTE URL now (via
 * `apiFetch`); a relative one would hit the product's own static host and come
 * back as SPA-fallback HTML with a 200. Matching on the path keeps the route
 * matchers below anchored.
 */
const pathOf = (url: string) => String(url).replace(/^https?:\/\/[^/]+/i, "");

function respond(match: RegExp, body: unknown, status = 200, method?: string) {
  handlers.unshift((url, init) => {
    if (!match.test(pathOf(url))) return undefined;
    if (method && (init?.method ?? "GET") !== method) return undefined;
    return { status, body };
  });
}

/** Keep matching requests in flight until the returned function is called. */
function holdRequests(match: RegExp) {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  gate = { match, promise };
  return () => {
    gate = null;
    release();
  };
}

const PROJECT = {
  id: 7,
  title: "Website-Relaunch",
  status: "in_progress",
  start_date: "2026-07-01",
  target_date: "2026-09-30",
  description: "Kompletter Neubau",
};
const MILESTONE = {
  id: 11,
  title: "Konzept",
  status: "pending" as const,
  due_date: "2026-08-01",
  completed_at: null,
  sort_order: 1,
};

beforeEach(() => {
  calls = [];
  gate = null;
  handlers = [() => ({ status: 200, body: {} })];
  respond(/^\/projects$/, { projects: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const g = gate;
      if (g && g.match.test(pathOf(url))) await g.promise;
      const reply = handlers.map((h) => h(url, init)).find((r) => r !== undefined)!;
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
    }),
  );
});

afterEach(() => cleanup());

const user = () => userEvent.setup({ delay: null });
const got = (match: RegExp) => calls.filter((c) => match.test(pathOf(c.url)));

async function open(projects: unknown[] = [PROJECT]) {
  respond(/^\/projects$/, { projects }, 200, "GET");
  render(<ProjectList />);
  const u = user();
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  return u;
}

const card = (title: string) => screen.getAllByRole("listitem").find((li) => li.textContent!.includes(title))!;
/**
 * A milestone row, scoped to the timeline `<ol>` — the enclosing project `<li>`
 * contains every milestone AND its own status badge, so an unscoped lookup
 * matches the wrong element (and "In Arbeit" appears on both levels).
 */
// The milestone <ol> carries the shared `.tds-list` class; it was
// `.milestone-list` until the design library absorbed the bespoke list names,
// and this helper kept looking for the old one — so it returned `undefined`
// and the three tests below failed with "Expected container to be an Element".
const milestone = (title: string) =>
  screen
    .getAllByRole("listitem")
    .find((li) => li.parentElement?.classList.contains("tds-list") && li.textContent!.includes(title))!;

// apiFetch consults the host-side runtime config (/tds-runtime.json) before it
// resolves a URL, so without this the first entry in fetch.mock.calls is that
// probe rather than the endpoint under test. The panel products never ship the
// file — they render <meta name="tds-api-base"> instead — so "absent" is also
// what actually happens in production.
beforeEach(() => primeRuntimeConfig(null));

describe("loading", () => {
  it("reads the company's projects with credentials", async () => {
    await open();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(pathOf(fetchMock.mock.calls[0]![0] as string)).toBe("/projects");
    // Absolute, on the API host. Every other assertion here matches the PATH,
    // which a relative fetch satisfies too — so this is the one that fails if
    // the call ever goes back to the product's own origin (whose SPA fallback
    // answers 200 + HTML and turns into a silent empty state).
    expect(String(fetchMock.mock.calls[0]![0]).startsWith("https://api.tracht-digital.de/")).toBe(true);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("shows a loading line until the list arrives", () => {
    render(<ProjectList />);
    expect(screen.getByLabelText("Wird geladen")).toBeTruthy();
  });

  it("says so when the company has no projects", async () => {
    await open([]);
    expect(await screen.findByText("Noch keine Projekte.")).toBeTruthy();
  });

  it("treats a 403 as NO ACCESS, not as a failure", async () => {
    respond(/^\/projects$/, {}, 403, "GET");
    render(<ProjectList />);
    expect(await screen.findByText("Kein Zugriff auf Projekte.")).toBeTruthy();
    expect(screen.queryByText(/konnten nicht geladen werden/)).toBeNull();
  });

  it("reports any other failure as an error", async () => {
    respond(/^\/projects$/, {}, 500, "GET");
    render(<ProjectList />);
    expect(await screen.findByText("Projekte konnten nicht geladen werden.")).toBeTruthy();
  });

  it("does NOT list projects carried by a non-OK response", async () => {
    respond(/^\/projects$/, { projects: [PROJECT] }, 500, "GET");
    render(<ProjectList />);
    await screen.findByText("Projekte konnten nicht geladen werden.");
    expect(screen.queryByText("Website-Relaunch")).toBeNull();
  });

  it("reports a rejected request rather than hanging on the loading line", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    render(<ProjectList />);
    expect(await screen.findByText("Projekte konnten nicht geladen werden.")).toBeTruthy();
  });

  it("tolerates a response with no projects field", async () => {
    respond(/^\/projects$/, {}, 200, "GET");
    render(<ProjectList />);
    expect(await screen.findByText("Noch keine Projekte.")).toBeTruthy();
  });

  it("shows each project with its translated status", async () => {
    await open([PROJECT]);
    expect(await screen.findByText("Website-Relaunch")).toBeTruthy();
    expect(screen.getByText("In Arbeit")).toBeTruthy();
  });

  it("falls back to the raw status for one it does not know", async () => {
    await open([{ ...PROJECT, status: "archived" }]);
    expect(await screen.findByText("archived")).toBeTruthy();
  });

  it("translates every status the admin can set, ON THE RIGHT PROJECT", async () => {
    // Checking only that all four labels appear somewhere passes when two of
    // them are swapped — "Abgeschlossen" on a paused project is a lie a
    // customer would act on.
    await open([
      { ...PROJECT, id: 1, title: "Eins", status: "discovery" },
      { ...PROJECT, id: 2, title: "Zwei", status: "review" },
      { ...PROJECT, id: 3, title: "Drei", status: "delivered" },
      { ...PROJECT, id: 4, title: "Vier", status: "on_hold" },
    ]);
    await screen.findByText("Eins");
    expect(within(card("Eins")).getByText("Analyse")).toBeTruthy();
    expect(within(card("Zwei")).getByText("Abnahme")).toBeTruthy();
    expect(within(card("Drei")).getByText("Abgeschlossen")).toBeTruthy();
    expect(within(card("Vier")).getByText("Pausiert")).toBeTruthy();
  });

  it("does not load any detail before a project is opened", async () => {
    await open([PROJECT]);
    await screen.findByText("Website-Relaunch");
    expect(got(/^\/projects\/7$/)).toHaveLength(0);
  });
});

describe("opening a project", () => {
  it("loads the milestones of the project that was opened", async () => {
    respond(/^\/projects\/7$/, { milestones: [MILESTONE] }, 200, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    await waitFor(() => expect(got(/^\/projects\/7$/)).toHaveLength(1));
    expect(await screen.findByText("Konzept")).toBeTruthy();
  });

  it("loads the SECOND project's own detail, not the first one's", async () => {
    respond(/^\/projects\/9$/, { milestones: [{ ...MILESTONE, title: "Shop-Kickoff" }] }, 200, "GET");
    const u = await open([PROJECT, { ...PROJECT, id: 9, title: "Shop" }]);
    await u.click(await screen.findByRole("button", { name: /Shop/ }));
    await waitFor(() => expect(got(/^\/projects\/9$/)).toHaveLength(1));
    expect(got(/^\/projects\/7$/)).toHaveLength(0);
    expect(await screen.findByText("Shop-Kickoff")).toBeTruthy();
  });

  it("marks the open card with aria-expanded", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([PROJECT]);
    const head = await screen.findByRole("button", { name: /Website-Relaunch/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    await u.click(head);
    await waitFor(() => expect(head.getAttribute("aria-expanded")).toBe("true"));
  });

  it("closes again on a second click", async () => {
    respond(/^\/projects\/7$/, { milestones: [MILESTONE] }, 200, "GET");
    const u = await open([PROJECT]);
    const head = await screen.findByRole("button", { name: /Website-Relaunch/ });
    await u.click(head);
    await screen.findByText("Konzept");
    await u.click(head);
    expect(screen.queryByText("Konzept")).toBeNull();
    expect(head.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not re-fetch when merely closing", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([PROJECT]);
    const head = await screen.findByRole("button", { name: /Website-Relaunch/ });
    await u.click(head);
    await waitFor(() => expect(got(/^\/projects\/7$/)).toHaveLength(1));
    await u.click(head);
    expect(got(/^\/projects\/7$/)).toHaveLength(1);
  });

  it("opens ONE project at a time", async () => {
    respond(/^\/projects\/\d+$/, { milestones: [] }, 200, "GET");
    const u = await open([PROJECT, { ...PROJECT, id: 9, title: "Shop" }]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    await u.click(await screen.findByRole("button", { name: /Shop/ }));
    const expanded = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-expanded") === "true");
    expect(expanded).toHaveLength(1);
    expect(expanded[0]!.textContent).toContain("Shop");
  });

  it("shows the description and both dates", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    expect(await screen.findByText("Kompletter Neubau")).toBeTruthy();
    expect(screen.getByText("01.07.2026")).toBeTruthy();
    expect(screen.getByText("30.09.2026")).toBeTruthy();
  });

  it("shows a dash for a project with no dates", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([{ ...PROJECT, start_date: null, target_date: null }]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(2));
  });

  it("omits the description block when there is none", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([{ ...PROJECT, description: "" }]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    await screen.findByText("Meilensteine");
    expect(document.querySelector(".project-card__desc")).toBeNull();
  });

  it("shows a loading line while the detail is in flight", async () => {
    const release = holdRequests(/^\/projects\/7$/);
    respond(/^\/projects\/7$/, { milestones: [MILESTONE] }, 200, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    expect(await screen.findByLabelText("Wird geladen")).toBeTruthy();
    release();
    expect(await screen.findByText("Konzept")).toBeTruthy();
  });

  it("says so when a project has no milestones", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    expect(await screen.findByText("Keine Meilensteine.")).toBeTruthy();
  });

  it("shows no milestones when the detail request fails", async () => {
    // An empty timeline is honest; a stale one would be another project's.
    respond(/^\/projects\/7$/, { milestones: [MILESTONE] }, 500, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    expect(await screen.findByText("Keine Meilensteine.")).toBeTruthy();
    expect(screen.queryByText("Konzept")).toBeNull();
  });

  it("recovers from a rejected detail request", async () => {
    respond(/^\/projects\/7$/, { milestones: [] }, 200, "GET");
    const u = await open([PROJECT]);
    (fetch as unknown as { mockImplementationOnce: (f: () => Promise<never>) => void }).mockImplementationOnce(
      async () => { throw new TypeError("offline"); },
    );
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    expect(await screen.findByText("Keine Meilensteine.")).toBeTruthy();
  });

  it("tolerates a detail response with no milestones field", async () => {
    respond(/^\/projects\/7$/, {}, 200, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    expect(await screen.findByText("Keine Meilensteine.")).toBeTruthy();
  });
});

describe("the milestone timeline", () => {
  async function openDetail(milestones: unknown[]) {
    respond(/^\/projects\/7$/, { milestones }, 200, "GET");
    const u = await open([PROJECT]);
    await u.click(await screen.findByRole("button", { name: /Website-Relaunch/ }));
    await waitFor(() => expect(got(/^\/projects\/7$/)).toHaveLength(1));
    return u;
  }

  it("lists a milestone with its status and due date", async () => {
    await openDetail([MILESTONE]);
    const row = card("Konzept");
    expect(within(row).getByText("Offen")).toBeTruthy();
    expect(within(row).getByText("01.08.2026")).toBeTruthy();
  });

  it("labels each milestone with its OWN status", async () => {
    // Asserting only that all three labels exist passes when they are shuffled.
    await openDetail([
      MILESTONE,
      { ...MILESTONE, id: 12, title: "Umsetzung", status: "in_progress" },
      { ...MILESTONE, id: 13, title: "Abnahme", status: "completed" },
    ]);
    expect(within(milestone("Konzept")).getByText("Offen")).toBeTruthy();
    expect(within(milestone("Umsetzung")).getByText("In Arbeit")).toBeTruthy();
    expect(within(milestone("Abnahme")).getByText("Erledigt")).toBeTruthy();
  });

  it("carries the status into the chip variant", async () => {
    // The status used to colour the ROW (`milestone--completed`); the design
    // library moved it onto a shared `.chip--*`, and this assertion was left
    // pointing at a class that no longer exists — i.e. it was asserting
    // nothing, on the one element whose colour IS the information.
    await openDetail([{ ...MILESTONE, status: "completed" }]);
    const chip = within(milestone("Konzept")).getByText("Erledigt");
    expect(chip.className).toContain("chip--success");
  });

  it("falls back to the raw status for one it does not know", async () => {
    await openDetail([{ ...MILESTONE, status: "blocked" }]);
    expect(screen.getByText("blocked")).toBeTruthy();
  });

  it("shows a dash for a milestone with no due date", async () => {
    await openDetail([{ ...MILESTONE, due_date: null }]);
    expect(within(milestone("Konzept")).getByText("—")).toBeTruthy();
  });

  it("keeps the order the API returned", async () => {
    // The backend sorts by sort_order; re-sorting here would fight it.
    await openDetail([
      { ...MILESTONE, id: 12, title: "Zuerst", sort_order: 1 },
      { ...MILESTONE, id: 13, title: "Danach", sort_order: 2 },
    ]);
    const titles = [...document.querySelectorAll(".milestone__title")].map((e) => e.textContent);
    expect(titles).toEqual(["Zuerst", "Danach"]);
  });
});
