# Testing

```bash
npm run test:run   # vitest; islands opt into jsdom per file via a @vitest-environment docblock
composer test      # phpunit
```

CI (`_build.yml`) runs both suites, plus type-check, `lint:primitives` and build, on
every run.

## Test environment against the current tds-shared

tds-shared is a **peer** dependency, so a fresh standalone install may resolve an old
version while every product build composes the current one. Keep these in mind:

- `apiFetch` first consults the host runtime config (`/tds-runtime.json`), so
  `fetch.mock.calls[0]` is that probe. Call **`primeRuntimeConfig(null)`** in
  `beforeEach`; panel products never ship that file, so "absent" matches production.
- `apiFetch` is **async**. `await waitFor(() => expect(fetch).toHaveBeenCalled())`
  before reading `mock.calls`.
- A multipart upload carries an **empty** `headers` object. Assert "no content-type
  header", never "headers is undefined".
- Error-path tests answer with a **populated** body and a non-OK status. Against an
  empty error body the ok-check is unobservable.
- At least one assertion per suite pins the **absolute API host** (see
  [frontend-conventions.md](frontend-conventions.md#api-calls-apifetch-never-a-relative-fetch)).

## Suites

| Suite | Sharpest assertions |
|---|---|
| `islands/ProjectsAdmin.test.tsx` | Delete is confirm-gated and cascades; declining sends nothing. Edit PATCHes, create POSTs. `customer_id` locked after create. Milestone cycle in all three steps including the wrap; PATCH carries title and due date. |
| `islands/ProjectList.test.tsx` | Detail belongs to the opened project; one card open at a time; failed detail → empty timeline. |
| `islands/WidgetBody.test.tsx` | The active-project tile. |
| `src/index.test.ts` + `tests/packaging.test.ts` | Manifest as a product build sees it; both gating levels in both directions (route **and** nav). |
| `php/tests/ProjectsModuleTest.php`, `ProjectsApiDocsTest.php` | Module behaviour and API-doc parity. |

Mutation check: 64 breakages, 62 caught. The two survivors are equivalent mutants kept as
defence in depth:

1. Dropping the JS "customer is required" guard: the input carries HTML `required` while
   creating, so the browser blocks the submit first (the attribute is asserted instead).
2. Dropping `e.preventDefault()` in the milestone input's Enter handler: that input lives
   **outside** the project `<form>`, so Enter can't submit it either way.
