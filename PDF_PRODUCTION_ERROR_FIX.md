# Production PDF renderer recovery

**Status: APPROVED FOR RELEASE — architecture, same-container renderer trust boundary, and estimated transient RAM cost approved by owner. Final production and Android checks remain pending.**
**Investigation date:** 2026-10-23

## Existing production failure

The production PDF endpoint previously returned HTTP 503. Railway runtime logs showed the initial Chromium exception `chrome_crashpad_handler: --database is required`. Writable XDG paths moved the launch past Crashpad, then demonstrated that Chromium's Linux sandbox cannot initialize under UID 1000 in the current Railway service container. Root execution with sandbox enabled is also refused. Chromium, its shared libraries, and Cairo fonts were present. No `--no-sandbox` option was added.

Read-only Railway CLI inspection previously identified production deployment `3c2b50a7-9b67-4c1e-961d-10a1e2837a0a` on backend commit `b02d4bebd0eb067b98c739f3ba00f9b8e7ae0933`. No new production request was sent during this phase, and no fix deployment exists.

## Option evaluation

| Approach | Arabic/report correctness | Security | Railway compatibility | Cost and maintenance |
|---|---|---|---|---|
| A. WeasyPrint 69.0 with Pango/HarfBuzz | Visually verified against the existing report template after narrow RTL and pagination fixes. Cairo fonts are embedded; Arabic/English text, SVG chart, tables, repeated table headers, multi-page breaks, and disclaimers rendered. The upstream docs still state that general CSS RTL/bidi support is incomplete, so keep visual regression coverage for the report's mixed-direction cases. | No Chromium or JavaScript. The renderer blocks all resource fetches except embedded Cairo font data, limits HTML/PDF size, time, CPU, address space, active jobs, and queue length, and logs no report content. It runs as a same-UID child in the backend container; this is resource-limited, not a hard OS security boundary. Treat it as part of the backend trust domain. | Local production-style Docker image build and synthetic report render passed. Railway deployment not attempted. | No new service. Adds Python and native packages to the existing image. Adds dependency/image maintenance. Local synthetic run peaked at about 110 MB RSS for the `tsx` parent plus the renderer subprocess; production incremental memory must be measured after release. |
| B. Separate Chromium renderer | Highest parity with the current browser-generated design if Chromium's sandbox remains enabled. The existing Railway service container cannot support that sandbox. | A Railway Sandbox VM supported sandboxed Chrome in an earlier synthetic test, but Sandboxes are temporary VMs with idle destruction and are not an always-on renderer. `ISOLATED` sandboxes cannot be reached from project services; `PRIVATE` sandboxes join the project network. A persistent isolated renderer would need a separately approved hosting boundary. Disabling Chromium sandboxing in a service would increase the impact of browser compromise and is not approved. | No production-compatible persistent, sandbox-enabled Railway renderer was verified. | A separate always-on Railway service sized at 1 vCPU / 1 GB would be approximately $30/month at current resource rates, plus egress and plan charges. A continuously running 1-vCPU / 1-GB Railway Sandbox VM would be approximately $100/month at VM rates, and sandbox idle timeouts make it unsuitable for a continuous service. Both are estimates, not quotes. |
| Direct PDF libraries such as pdfmake/PDFKit | Not selected. Their Arabic font embedding does not by itself establish correct Arabic shaping and bidi layout; maintained project issues document RTL limitations. | Smaller renderer surface, but high risk of malformed clinical mixed-direction values without extensive shaping/layout work. | Easy to package in Node. | Lower deployment complexity, but would require rebuilding tables, charts, pagination, and Arabic layout; maintenance and correctness risk are high. |

**Recommendation:** use Option A. Owner approved this architecture and its documented same-container trust boundary. It passed visual checks against the existing report template and avoids starting Chromium without its sandbox. The report source keeps its existing authentication, report ownership checks, contents, and endpoint contract. Full CSS bidi support remains a documented caveat.

## Isolated implementation and rendered output

The candidate is in a detached development worktree at `/tmp/sahati-pdf-weasy-worktree`; it is not yet merged or committed to the main checkout. The candidate replaces runtime Puppeteer with a Python WeasyPrint subprocess while preserving `GET /api/v1/reports/pdf` and the existing route. Puppeteer remains a development dependency only for the existing browser-test types; the Docker build skips its browser download and prunes dev dependencies from the runtime image. The candidate also:

- Moves the Arabic chart unit label from SVG text to normal HTML text so Pango shapes it correctly.
- Wraps the complete blood-pressure value and unit as one LTR run, preserving `118/77 mmHg` order in RTL tables.
- Restricts WeasyPrint fetches to embedded `data:font/ttf` Cairo font resources; HTTP(S), `file:`, and other data URLs are blocked.
- Caps input HTML at 2 MiB, PDF output at 20 MiB, renderer wall time at 20 seconds, Python CPU time at 12 seconds, address space at 768 MiB, active renderers at two, and queued renderers at eight. Temporary XDG paths are removed after each job; report content is not logged or written to a persistent file.
- Leaves the authentication and patient/report authorization route unchanged.

The synthetic full-template fixture used an invented Arabic patient name, 72 glucose readings, medications, 40 administrations, dates/times, English/Arabic mixed strings, an SVG glucose chart, multi-page tables, labs, symptoms, and disclaimers. The final Docker image build produced a valid 52,692-byte, four-page A4 PDF. Cairo font subsets were embedded. Visual inspection confirmed shaping, numeric order, table continuation/header behavior, chart output, disclaimer, and page numbering. No real patient information was used.

The current WeasyPrint documentation explicitly lists general RTL/bidirectional CSS as unsupported; the rendered fixture proves only the application's tested report patterns, not arbitrary CSS/layout combinations. See [WeasyPrint API: fonts and CSS support](https://doc.courtbouillon.org/weasyprint/latest/api_reference.html#fonts) for that caveat.

## Security and hosting trade-offs

The candidate does not launch Chromium and therefore has no browser sandbox setting to weaken. It does add the WeasyPrint/Pango/Cairo document parser to the existing backend image. Input is server-generated, user text is HTML-escaped, JavaScript is not executed, and external resource fetching is denied. The worker is a separate process with resource limits and a sanitized environment, but shares the backend container and UID; this is not a kernel isolation boundary. An exploit in the renderer could still affect the backend container's trust domain. If this shared-domain risk is not acceptable, use a separately isolated renderer service, with its added cost and service-auth/network review, rather than disabling a Chromium sandbox.

Railway currently lists service usage at $10/GB-month RAM, $20/vCPU-month, and $0.05/GB egress. The candidate adds no service. If the measured 110 MB local command peak were an incremental always-resident allocation, its RAM component would be about $1.10/month; actual request-time average and Railway metering are not yet measured, and should be expected to be lower if the worker is short-lived. A dedicated always-on 1-vCPU / 1-GB service would be about $30/month before egress and subscription/plan charges. Railway lists Sandbox VM usage at $50/GB-month plus $50/vCPU-month. No additional paid service has been created or approved. See [Railway service and VM pricing](https://docs.railway.com/pricing/plans).

Railway documents private service networking as encrypted WireGuard connectivity among services in a project environment; a new service would still need narrowly scoped authentication and must receive no database credentials or unrelated secrets. See [Railway private networking](https://docs.railway.com/networking/private-networking).

## Tests and verification

- Candidate Python fetch/size-limit tests: PASS, 4/4.
- Candidate `npm run test:security`: PASS, 15 passed, 0 failed, 4 skipped (database-dependent checks requiring an isolated PostgreSQL database).
- Candidate `npm run typecheck`: PASS. Docker production build also completed Next.js compile and type checks.
- Candidate `npm run test:security`: PASS, 15 passed, 0 failed, 4 database-dependent checks skipped without isolated test PostgreSQL.
- Candidate Python renderer fetch/size tests: PASS, 4/4.
- Candidate build with synthetic build-only values: PASS. Next.js `15.5.28` production build passed.
- Candidate exact-template PDF check inside the final Docker build: PASS; synthetic PDF is 52,692 bytes and begins with `%PDF-`. Prior visual inspection of the same report pattern confirmed four A4 pages, embedded Cairo subsets, Arabic shaping, chart/table/disclaimer layout, LTR values, and repeated long-table headers.
- Production runtime dependency audit (`npm audit --omit=dev`): PASS, 0 findings. Full development dependency audit still reports 11 moderate/high findings; the runtime Docker layer prunes those development packages. Next.js was updated in the lockfile from `15.5.27` to patched `15.5.28`, removing the critical production finding.
- Local Docker image build: PASS, including regression/security tests, synthetic report rendering, and production dependency pruning. The final image audit found 0 vulnerabilities.
- Candidate has not yet been merged into the main branch. Existing production endpoint result remains HTTP 503; no post-fix production result exists.

## Release status

- Chosen architecture: Chromium-free WeasyPrint in a resource-limited same-container subprocess. Owner approved this architecture and its estimated transient RAM cost on 2026-10-22.
- Backend correction commit: pending.
- Current Railway deployment: `3c2b50a7-9b67-4c1e-961d-10a1e2837a0a` (unfixed deployment).
- Authenticated production PDF result: NOT RUN; no HTTP 200 / `application/pdf` claim.
- Android download, viewer launch, share chooser, and live Arabic PDF rendering: NOT RUN because production still returns 503. Android source remains unchanged at commit `d41944a03c2c3b3db887ad2a77a3151f3569162e`.
- No production patient data, migrations, or database records were changed.

## Remaining release gates

The owner approved running the WeasyPrint/Pango renderer in the backend container's shared trust domain with the limits above and the estimated transient RAM cost; production usage must be monitored. No separate renderer service was created. Before release completion, commit and deploy the backend, verify an authenticated synthetic-account request returns HTTP 200 with `application/pdf`, monitor the Railway deployment, and complete Android download/view/share-chooser checks without sharing the report. General CSS bidi limits and same-container rather than kernel isolation remain documented trade-offs.
