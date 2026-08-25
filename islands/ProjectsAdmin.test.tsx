// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { primeRuntimeConfig } from "@tracht-digital-solutions/tds-shared/api";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsAdmin from "./ProjectsAdmin";
import { TOAST_EVENT } from "@tracht-digital-solutions/tds-shared/toast";

/**
 * Owner project management (admin-only).
 *
 * The three things worth pinning hardest:
 *
 *  - **deleting a project is gated behind `window.confirm`** and cascades to
 *    its milestones. Cancelling must send NOTHING — this is the only guard in
 *    front of an irreversible, multi-row delete.
 *  - **an edit PATCHes; only a create POSTs.** A POST while editing would
 *    duplicate the project instead of updating it.
 *  - **`customer_id` is locked once a project exists.** Re-homing a project to
 *    another company would move its milestones (and everything keyed off it)
 *    out from under the customer who can see it.
 */

interface Reply {
  status: number;
  body: unknown;
}
type Handler = (url: string, init?: RequestInit) => Reply | undefined;

let calls: Array<{ url: string; method: string; body: unknown }> = [];
let handlers: Handler[] = [];
let confirmAnswer = true;


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

const MILESTONE = { id: 11, title: "Konzept", status: "pending" as const, due_date: "2026-08-01" };
const PROJECT = {
  id: 7,
  customer_id: 3,
  title: "Website-Relaunch",
  status: "in_progress",
  start_date: "2026-07-01",
  target_date: "2026-09-30",
  milestones: [MILESTONE],
};

/** Mutation outcomes are toasts now — collected off the `tds:toast` bus. */
let toasts: Array<{ variant: string; message: string }> = [];
const collectToast = (e: Event) => {
  toasts.push((e as CustomEvent<{ variant: string; message: string }>).detail);
};

beforeEach(() => {
  calls = [];
  toasts = [];
  window.addEventListener(TOAST_EVENT, collectToast);
  confirmAnswer = true;
  handlers = [() => ({ status: 200, body: {} })];
  respond(/^\/admin\/projects$/, { projects: [] });
  vi.stubGlobal("confirm", vi.fn(() => confirmAnswer));
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const reply = handlers.map((h) => h(url, init)).find((r) => r !== undefined)!;
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
    }),
  );
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, collectToast);
  cleanup();
});

const user = () => userEvent.setup({ delay: null });
const sent = (method: string, match: RegExp) => calls.filter((c) => c.method === method && match.test(pathOf(c.url)));

async function open(projects: unknown[] = []) {
  respond(/^\/admin\/projects$/, { projects }, 200, "GET");
  render(<ProjectsAdmin />);
  const u = user();
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  await screen.findByRole("heading", { name: "Neues Projekt" });
  return u;
}

const item = (text: string) => screen.getAllByRole("listitem").find((li) => li.textContent!.includes(text))!;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

// apiFetch consults the host-side runtime config (/tds-runtime.json) before it
// resolves a URL, so without this the first entry in fetch.mock.calls is that
// probe rather than the endpoint under test. The panel products never ship the
// file — they render <meta name="tds-api-base"> instead — so "absent" is also
// what actually happens in production.
beforeEach(() => primeRuntimeConfig(null));

describe("loading", () => {
  it("reads every project across companies, with credentials", async () => {
    await open();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(pathOf(fetchMock.mock.calls[0]![0] as string)).toBe("/admin/projects");
    // Absolute, on the API host. Every other assertion here matches the PATH,
    // which a relative fetch satisfies too — so this is the one that fails if
    // the call ever goes back to the product's own origin (whose SPA fallback
    // answers 200 + HTML and turns into a silent empty state).
    expect(String(fetchMock.mock.calls[0]![0]).startsWith("https://api.tracht-digital.de/")).toBe(true);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("shows a loading line until the list arrives", () => {
    render(<ProjectsAdmin />);
    expect(screen.getByLabelText("Wird geladen")).toBeTruthy();
  });

  it("says so when nothing exists yet", async () => {
    await open();
    expect(screen.getByText("Noch keine Projekte.")).toBeTruthy();
  });

  it("lists a project with its status and owning customer", async () => {
    await open([PROJECT]);
    const row = item("Website-Relaunch");
    expect(within(row).getByText("In Arbeit")).toBeTruthy();
    expect(row.textContent).toContain("Kunde #3");
  });

  it("falls back to the raw status for one it does not know", async () => {
    await open([{ ...PROJECT, status: "archived" }]);
    expect(screen.getByText("archived")).toBeTruthy();
  });

  it("reports a failed load", async () => {
    respond(/^\/admin\/projects$/, {}, 500, "GET");
    render(<ProjectsAdmin />);
    expect(await screen.findByText("Projekte konnten nicht geladen werden.")).toBeTruthy();
  });

  it("does NOT list projects carried by a non-OK response", async () => {
    respond(/^\/admin\/projects$/, { projects: [PROJECT] }, 403, "GET");
    render(<ProjectsAdmin />);
    await screen.findByText("Projekte konnten nicht geladen werden.");
    expect(screen.queryByText("Website-Relaunch")).toBeNull();
  });

  it("tolerates a response with no projects field", async () => {
    respond(/^\/admin\/projects$/, {}, 200, "GET");
    render(<ProjectsAdmin />);
    await screen.findByRole("heading", { name: "Neues Projekt" });
    expect(screen.getByText("Noch keine Projekte.")).toBeTruthy();
  });

  it("still offers the create form when the list is empty", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeTruthy();
  });
});

describe("creating a project", () => {
  const created = () => sent("POST", /^\/admin\/projects$/);

  it("refuses a project with no title", async () => {
    const u = await open();
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    expect(created()).toHaveLength(0);
  });

  it("refuses a project with no customer", async () => {
    // A project with no owning company would be invisible to every portal.
    // NOTE: the browser's own `required` blocks this first, so the JS guard is
    // defence in depth — the attribute is asserted separately below.
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    expect(created()).toHaveLength(0);
  });

  it("marks title and customer as required while creating", async () => {
    await open();
    expect(field("Titel").required).toBe(true);
    expect(field("Kunde (customer_id)").required).toBe(true);
  });

  it("treats a whitespace-only title as empty", async () => {
    const u = await open();
    await u.type(field("Titel"), "   ");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    expect(created()).toHaveLength(0);
  });

  it("POSTs the new project as JSON", async () => {
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.type(field("Start"), "2026-07-01");
    await u.type(field("Ziel"), "2026-09-30");
    await u.type(screen.getByLabelText("Beschreibung"), "Kompletter Neubau");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(created()).toHaveLength(1));
    expect(created()[0]!.body).toEqual({
      title: "Website-Relaunch",
      customer_id: 3,
      status: "discovery",
      start_date: "2026-07-01",
      target_date: "2026-09-30",
      description: "Kompletter Neubau",
    });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!;
    expect((call[1] as RequestInit).headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends the customer id as a NUMBER, not the typed string", async () => {
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(created()).toHaveLength(1));
    expect((created()[0]!.body as { customer_id: unknown }).customer_id).toBe(3);
  });

  it("defaults a new project to the discovery phase", async () => {
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(created()).toHaveLength(1));
    expect((created()[0]!.body as { status: string }).status).toBe("discovery");
  });

  it("sends the chosen status", async () => {
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.selectOptions(screen.getByLabelText("Status"), "on_hold");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(created()).toHaveLength(1));
    expect((created()[0]!.body as { status: string }).status).toBe("on_hold");
  });

  it("clears the form and reloads on success", async () => {
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(2));
    expect(field("Titel").value).toBe("");
  });

  it("KEEPS the form filled when the save fails", async () => {
    respond(/^\/admin\/projects$/, { error: "nope" }, 500, "POST");
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].variant).toBe("danger");
    expect(field("Titel").value).toBe("Website-Relaunch");
  });

  it("does not reload after a failed save", async () => {
    respond(/^\/admin\/projects$/, { error: "nope" }, 500, "POST");
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(1);
  });

  it("re-enables the submit button afterwards", async () => {
    const u = await open();
    await u.type(field("Titel"), "Website-Relaunch");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(created()).toHaveLength(1));
    await waitFor(() => expect((screen.getByRole("button", { name: "Anlegen" }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("editing a project", () => {
  async function startEdit(u: ReturnType<typeof user>) {
    await u.click(within(item("Website-Relaunch")).getByRole("button", { name: "Bearbeiten" }));
    await screen.findByRole("heading", { name: "Projekt #7 bearbeiten" });
  }

  it("loads the project into the form", async () => {
    const u = await open([PROJECT]);
    await startEdit(u);
    expect(field("Titel").value).toBe("Website-Relaunch");
    expect(field("Kunde (customer_id)").value).toBe("3");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("in_progress");
    expect(field("Start").value).toBe("2026-07-01");
  });

  it("copes with a project that has no dates", async () => {
    // A `value={null}` date input still reads back as "", so the `?? ""`
    // coercion is invisible in the DOM — it only shows in the PATCH body,
    // where a null would clear a column the create path sets to "".
    const u = await open([{ ...PROJECT, start_date: null, target_date: null }]);
    await startEdit(u);
    expect(field("Start").value).toBe("");
    expect(field("Ziel").value).toBe("");
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", /^\/admin\/projects\/7$/)).toHaveLength(1));
    expect(sent("PATCH", /^\/admin\/projects\/7$/)[0]!.body).toMatchObject({
      start_date: "",
      target_date: "",
    });
  });

  it("LOCKS the owning customer once the project exists", async () => {
    // Re-homing a project would move its milestones out from under the
    // customer who can currently see them.
    const u = await open([PROJECT]);
    await startEdit(u);
    expect(field("Kunde (customer_id)").disabled).toBe(true);
  });

  it("leaves the customer field editable while creating", async () => {
    await open([PROJECT]);
    expect(field("Kunde (customer_id)").disabled).toBe(false);
  });

  it("PATCHes the project it opened — it never creates a duplicate", async () => {
    const u = await open([PROJECT]);
    await startEdit(u);
    await u.clear(field("Titel"));
    await u.type(field("Titel"), "Website-Relaunch 2");
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", /^\/admin\/projects\/7$/)).toHaveLength(1));
    expect(sent("POST", /^\/admin\/projects$/)).toHaveLength(0);
    expect(sent("PATCH", /^\/admin\/projects\/7$/)[0]!.body).toMatchObject({ title: "Website-Relaunch 2" });
  });

  it("edits the project whose button was pressed", async () => {
    const u = await open([PROJECT, { ...PROJECT, id: 9, title: "Shop", milestones: [] }]);
    await u.click(within(item("Shop")).getByRole("button", { name: "Bearbeiten" }));
    await screen.findByRole("heading", { name: "Projekt #9 bearbeiten" });
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", /^\/admin\/projects\/9$/)).toHaveLength(1));
    expect(sent("PATCH", /^\/admin\/projects\/7$/)).toHaveLength(0);
  });

  it("still requires a title when editing", async () => {
    const u = await open([PROJECT]);
    await startEdit(u);
    await u.clear(field("Titel"));
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    expect(sent("PATCH", /admin\/projects/)).toHaveLength(0);
  });

  it("returns to the create form after saving", async () => {
    const u = await open([PROJECT]);
    await startEdit(u);
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("heading", { name: "Neues Projekt" })).toBeTruthy();
  });

  it("abandons an edit without sending anything", async () => {
    const u = await open([PROJECT]);
    await startEdit(u);
    await u.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("heading", { name: "Neues Projekt" })).toBeTruthy();
    expect(field("Titel").value).toBe("");
    expect(sent("PATCH", /admin\/projects/)).toHaveLength(0);
  });

  it("offers Abbrechen only while editing", async () => {
    await open([PROJECT]);
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });
});

describe("deleting a project", () => {
  // Deletion moved from window.confirm() to the shared <ConfirmDialog> (a
  // native <dialog>) and these tests were never migrated with it: they assert a
  // confirm() that is no longer called and a DELETE that the row button alone
  // no longer fires, so all four had been failing. The guard they exist for is
  // unchanged — nothing is sent until the dialog is confirmed.
  const dialogButton = (name: RegExp) => screen.getAllByRole("button", { name }).at(-1)!;

  async function pressDelete(u: ReturnType<typeof user>, project: string) {
    await u.click(within(item(project)).getByRole("button", { name: "Löschen" }));
    await screen.findByText(/löschen\?$/);
  }

  it("ASKS before deleting, and mentions the milestone cascade", async () => {
    const u = await open([PROJECT]);
    await pressDelete(u, "Website-Relaunch");
    expect(screen.getByText("Alle Meilensteine des Projekts werden mitgelöscht.")).toBeTruthy();
    expect(sent("DELETE", /admin\/projects/)).toHaveLength(0); // nothing sent yet
  });

  it("SENDS NOTHING when the confirmation is declined", async () => {
    // The only guard in front of an irreversible, cascading delete.
    const u = await open([PROJECT]);
    await pressDelete(u, "Website-Relaunch");
    await u.click(dialogButton(/Abbrechen/));
    expect(sent("DELETE", /admin\/projects/)).toHaveLength(0);
    expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(1);
  });

  it("deletes the project whose button was pressed", async () => {
    const u = await open([PROJECT, { ...PROJECT, id: 9, title: "Shop", milestones: [] }]);
    await pressDelete(u, "Shop");
    await u.click(dialogButton(/Löschen/));
    await waitFor(() => expect(sent("DELETE", /^\/admin\/projects\/9$/)).toHaveLength(1));
    expect(sent("DELETE", /^\/admin\/projects\/7$/)).toHaveLength(0);
  });

  it("reloads the list afterwards", async () => {
    const u = await open([PROJECT]);
    await pressDelete(u, "Website-Relaunch");
    await u.click(dialogButton(/Löschen/));
    await waitFor(() => expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(2));
  });

  it("reports a rejected delete instead of just closing the dialog", async () => {
    // The response used to be discarded: a 403 closed the dialog, reloaded the
    // list, and the row simply reappeared with no explanation.
    respond(/^\/admin\/projects\/7$/, {}, 403, "DELETE");
    const u = await open([PROJECT]);
    await pressDelete(u, "Website-Relaunch");
    await u.click(dialogButton(/Löschen/));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0]!.variant).toBe("danger");
    expect(toasts[0]!.message).toContain("403");
  });
});

describe("milestones", () => {
  const msInput = () => screen.getByPlaceholderText("Meilenstein hinzufügen …");

  it("lists a project's milestones with their status", async () => {
    await open([PROJECT]);
    expect(screen.getByText("Konzept")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Offen" })).toBeTruthy();
  });

  it("copes with a project that has no milestones field", async () => {
    await open([{ ...PROJECT, milestones: undefined }]);
    expect(screen.getByText("Website-Relaunch")).toBeTruthy();
  });

  it("adds a milestone to the right project", async () => {
    const u = await open([PROJECT, { ...PROJECT, id: 9, title: "Shop", milestones: [] }]);
    const inputs = screen.getAllByPlaceholderText("Meilenstein hinzufügen …");
    await u.type(inputs[1]!, "Kickoff");
    await u.click(within(item("Shop")).getByRole("button", { name: "Meilenstein hinzufügen" }));
    await waitFor(() => expect(sent("POST", /^\/admin\/projects\/9\/milestones$/)).toHaveLength(1));
    expect(sent("POST", /^\/admin\/projects\/9\/milestones$/)[0]!.body).toEqual({ title: "Kickoff" });
    expect(sent("POST", /^\/admin\/projects\/7\/milestones$/)).toHaveLength(0);
  });

  it("trims the milestone title", async () => {
    const u = await open([PROJECT]);
    await u.type(msInput(), "  Kickoff  ");
    await u.click(screen.getByRole("button", { name: "Meilenstein hinzufügen" }));
    await waitFor(() => expect(sent("POST", /milestones$/)).toHaveLength(1));
    expect(sent("POST", /milestones$/)[0]!.body).toEqual({ title: "Kickoff" });
  });

  it("refuses an empty milestone", async () => {
    const u = await open([PROJECT]);
    await u.click(screen.getByRole("button", { name: "Meilenstein hinzufügen" }));
    expect(sent("POST", /milestones$/)).toHaveLength(0);
  });

  it("refuses a whitespace-only milestone", async () => {
    const u = await open([PROJECT]);
    await u.type(msInput(), "   ");
    await u.click(screen.getByRole("button", { name: "Meilenstein hinzufügen" }));
    expect(sent("POST", /milestones$/)).toHaveLength(0);
  });

  it("adds a milestone on Enter without submitting the project form", async () => {
    // The project form is filled FIRST on purpose: with it empty, its own
    // guard would swallow a stray submit and the missing preventDefault()
    // would be invisible.
    const u = await open([PROJECT]);
    await u.type(field("Titel"), "Versehentlich");
    await u.type(field("Kunde (customer_id)"), "3");
    await u.type(msInput(), "Kickoff{Enter}");
    await waitFor(() => expect(sent("POST", /milestones$/)).toHaveLength(1));
    expect(sent("POST", /^\/admin\/projects$/)).toHaveLength(0);
  });

  it("clears only that project's draft after adding", async () => {
    const u = await open([PROJECT, { ...PROJECT, id: 9, title: "Shop", milestones: [] }]);
    const inputs = screen.getAllByPlaceholderText("Meilenstein hinzufügen …");
    await u.type(inputs[0]!, "Kickoff");
    await u.type(inputs[1]!, "Später");
    await u.click(within(item("Website-Relaunch")).getByRole("button", { name: "Meilenstein hinzufügen" }));
    await waitFor(() => expect(sent("POST", /milestones$/)).toHaveLength(1));
    const after = screen.getAllByPlaceholderText("Meilenstein hinzufügen …");
    expect((after[0]! as HTMLInputElement).value).toBe("");
    expect((after[1]! as HTMLInputElement).value).toBe("Später");
  });

  it("reloads the list after adding a milestone", async () => {
    const u = await open([PROJECT]);
    await u.type(msInput(), "Kickoff");
    await u.click(screen.getByRole("button", { name: "Meilenstein hinzufügen" }));
    await waitFor(() => expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(2));
  });

  it("CYCLES a milestone forward through the three states", async () => {
    const u = await open([PROJECT]);
    await u.click(screen.getByRole("button", { name: "Offen" }));
    await waitFor(() => expect(sent("PATCH", /^\/admin\/milestones\/11$/)).toHaveLength(1));
    expect(sent("PATCH", /^\/admin\/milestones\/11$/)[0]!.body).toMatchObject({ status: "in_progress" });
  });

  it("cycles the milestone whose badge was pressed", async () => {
    // With a single milestone, "the one I clicked" and "the first one" are the
    // same row and a wrong-target bug would be invisible.
    const u = await open([
      { ...PROJECT, milestones: [MILESTONE, { ...MILESTONE, id: 12, title: "Abnahme", status: "in_progress" }] },
    ]);
    await u.click(screen.getByRole("button", { name: "In Arbeit" }));
    await waitFor(() => expect(sent("PATCH", /^\/admin\/milestones\/12$/)).toHaveLength(1));
    expect(sent("PATCH", /^\/admin\/milestones\/11$/)).toHaveLength(0);
    expect(sent("PATCH", /^\/admin\/milestones\/12$/)[0]!.body).toMatchObject({
      title: "Abnahme",
      status: "completed",
    });
  });

  it("advances in_progress to completed", async () => {
    await open([{ ...PROJECT, milestones: [{ ...MILESTONE, status: "in_progress" }] }]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "In Arbeit" }));
    await waitFor(() => expect(sent("PATCH", /milestones\/11$/)).toHaveLength(1));
    expect(sent("PATCH", /milestones\/11$/)[0]!.body).toMatchObject({ status: "completed" });
  });

  it("WRAPS completed back round to pending", async () => {
    // The cycle is the only way to correct a milestone marked done by mistake.
    await open([{ ...PROJECT, milestones: [{ ...MILESTONE, status: "completed" }] }]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Erledigt" }));
    await waitFor(() => expect(sent("PATCH", /milestones\/11$/)).toHaveLength(1));
    expect(sent("PATCH", /milestones\/11$/)[0]!.body).toMatchObject({ status: "pending" });
  });

  it("carries the title and due date through the status change", async () => {
    // The PATCH replaces the row; dropping them would blank the milestone.
    const u = await open([PROJECT]);
    await u.click(screen.getByRole("button", { name: "Offen" }));
    await waitFor(() => expect(sent("PATCH", /milestones\/11$/)).toHaveLength(1));
    expect(sent("PATCH", /milestones\/11$/)[0]!.body).toEqual({
      title: "Konzept",
      status: "in_progress",
      due_date: "2026-08-01",
    });
  });

  it("reloads the list after a status change", async () => {
    const u = await open([PROJECT]);
    await u.click(screen.getByRole("button", { name: "Offen" }));
    await waitFor(() => expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(2));
  });

  it("deletes the milestone whose × was pressed", async () => {
    const u = await open([
      { ...PROJECT, milestones: [MILESTONE, { ...MILESTONE, id: 12, title: "Abnahme" }] },
    ]);
    // Scoped to the milestone <ol>: the enclosing project <li> also contains
    // "Abnahme", and with it every milestone's × button.
    const second = screen
      .getAllByRole("listitem")
      .find((li) => li.parentElement?.tagName === "OL" && li.textContent!.includes("Abnahme"))!;
    await u.click(within(second).getByRole("button", { name: "Meilenstein löschen" }));
    // The × is gated by the same <ConfirmDialog> as the project delete — it is
    // exactly the control a misclick lands on — so the request only leaves
    // after the dialog is confirmed.
    await u.click(screen.getAllByRole("button", { name: /Löschen/ }).at(-1)!);
    await waitFor(() => expect(sent("DELETE", /^\/admin\/milestones\/12$/)).toHaveLength(1));
    expect(sent("DELETE", /^\/admin\/milestones\/11$/)).toHaveLength(0);
  });

  it("reloads the list after deleting a milestone", async () => {
    const u = await open([PROJECT]);
    await u.click(screen.getByRole("button", { name: "Meilenstein löschen" }));
    await u.click(screen.getAllByRole("button", { name: /Löschen/ }).at(-1)!);
    await waitFor(() => expect(sent("GET", /^\/admin\/projects$/)).toHaveLength(2));
  });
});
