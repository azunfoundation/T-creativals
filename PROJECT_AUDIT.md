# Creativals OS — Production-Readiness Audit (Module-by-Module)

This file is the continuity record for the module-by-module hardening effort.
It is updated after each module is completed. For the full platform-wide audit
performed before this effort began (all 237 routes, all 54 pages, critical bug
fixes), see [AUDIT_REPORT.md](AUDIT_REPORT.md) — that work is treated as done
and is not repeated here.

## Standing working rules (apply to every module from Projects & Tasks onward)

- **PM-first, engineer-second.** When current behavior and simplicity/usability
  conflict, redesign — don't preserve a confusing implementation just because
  it's already there.
- **Every module needs onboarding built in**, using the shared components
  `frontend/src/components/ui/HelpIcon.tsx` and `HowToUseGuide.tsx`:
  - A `HelpIcon` next to non-obvious fields/sections (short hover tip via
    `text`, or a richer what/why/when popover via `content`).
  - A `HowToUseGuide` button in the page header for every major page — covers
    overview + step-by-step + best practices + common mistakes, and
    auto-opens once per browser on first visit (localStorage-tracked).
  - Empty states must tell the user what to click, not just that there's
    nothing there (`EmptyState`'s `action` prop).
  - Rename internal/technical jargon (sprint numbers, backend field names,
    stub labels) to plain business language before it reaches the UI.
- **No browser verification.** The user tests every module manually. Use
  `php -l`, `php artisan test`, and `npx tsc --noEmit` only.
- Update this file after each module, then stop — don't auto-continue to the
  next module in the same session.

## Planned module order

1. **CRM / Leads** ✅ done (2026-07-09)
2. **Quotes & Invoicing** ✅ done (2026-07-09)
3. **Projects & Tasks** ✅ done (2026-07-09)
4. **Timesheets** ✅ done (2026-07-09)
5. **Attendance** ✅ done (2026-07-10)
6. **Expenses** ✅ done (2026-07-10)
7. **Payroll** ✅ done (2026-07-10)
8. **Reports** ✅ done (2026-07-10)
9. **Settings & Notifications** ✅ done (2026-07-10) — done out of order, by explicit
   user request, ahead of Dashboard/Clients/Services/Users/Roles & Permissions.
10. **Dashboard** ✅ done (2026-07-10)
11. **Clients** ✅ done (2026-07-10)
12. **Services & Packages** ✅ done (2026-07-10)
13. **Users, Departments & Roles** ✅ done (2026-07-10)
14. Roles & Permissions (rewritten in the Production Readiness audit; verified in 13)
15. **AI Assistant & Automations** ✅ done (2026-07-11) (chat/automations — separate from the Settings module's own scope; see that module's notes on why no "AI settings" page exists)
16. **Client Portal** ✅ done (2026-07-11)
17. **Cross-cutting completion** ✅ done (2026-07-11)
18. Final production cleanup ← up next

Revised per the user's 2026-07-09 request to follow the real agency workflow
(lead → client → quote → invoice → project/tasks → time → attendance →
expenses → payroll → reports → dashboard) and to audit Clients, Services,
Users, Roles & Permissions, and Settings as their own modules rather than
folding them into Dashboard/CRM.

Rationale: build out the core business flow (lead → client → quote → invoice
→ project → time/expense → payroll → reports) correctly first, so the
Dashboard (built last) reflects real, correct data from every module instead
of being patched repeatedly as upstream modules change.

---

## Module: CRM / Leads

**Status:** ✅ production-ready (completed 2026-07-09)

### Scope
Lead sources, lead stages, leads list/detail, activities, stage changes,
convert-to-client, convert-to-quote, and the handoff into Quotes.

### Findings (root causes, before fixes)
1. **Lead → Client → Quote handoff was completely broken.** `LeadController::convert()`
   created a bare "shell" Quote and set `converted_client_id = null` with a
   comment calling it a "placeholder" — no Client/User was ever created or
   linked, and `quotes.client_id` (a real, FK-checked column) was left null on
   every quote created this way. There was no UI for picking/creating a
   client during conversion either. This broke the entire downstream chain:
   an unbilled, clientless quote can't legitimately become an invoice.
2. The Quote created on conversion had **no line items** — subtotal/total
   were just the lead's flat "estimated monthly budget", ignoring any
   services the lead was actually interested in.
3. **Follow-up scheduling was silently broken.** The frontend sent
   `due_date`/`status`/`logged_by` to `POST /leads/{id}/activities`, but the
   backend only accepts `due_at` — so the field was silently dropped and no
   `lead_followups` row was ever created, despite the "Follow-up" tab and
   "Pending Follow-ups" panel implying it worked.
4. `lead_followups` had **zero API surface** — nothing listed, read, or
   completed them. The frontend's "Pending Follow-ups" panel and "mark
   complete" button operated on fabricated client-side state
   (`updateLeadMutation.mutate({ activities: [...] })`), silently no-op'd by
   the backend since `activities` isn't a field `LeadController::update()`
   accepts.
5. Stage-change and sales-exec/sales-head reassignment handlers tried to
   piggyback an "activity log" entry onto the same silently-ignored
   `activities` field — the reassignment itself worked, but no audit trail
   activity was ever actually recorded.
6. **Interested services were never wired to the real catalog.** Both the
   create-lead form and the lead-detail checklist used a hardcoded list of
   service name strings (`INTERESTED_SERVICES_OPTIONS`) that didn't match
   `interested_service_ids` (the real, catalog-backed field) — so selecting
   services on lead creation silently did nothing, and the detail page's
   checklist could never reflect a lead's true state.
7. No idempotency guard on `convert()` — calling it twice on the same lead
   would create a second Quote and silently overwrite `converted_at`.
8. `LeadSourceController::destroy()` had no in-use guard (unlike
   `LeadStageController`, which already blocked deleting system stages) —
   deleting a source in active use on leads silently orphaned their
   `lead_source_id` via `nullOnDelete()`.
9. Dead code: `MOCK_LEAD_STAGES`/`MOCK_LEAD_SOURCES`/`MOCK_USERS`/
   `makeMockLead` fallback objects on both CRM pages that were defined but
   never actually reachable (real queries already degrade to `[]`/error
   states on failure) — pure clutter, never fixed a real outage.
10. CRM leads list swallowed fetch failures to an empty list with no error
    banner — a real outage looked identical to "no leads yet".

### Fixes applied
- `LeadController::convert()` (`backend/app/Http/Controllers/Api/V1/LeadController.php`)
  now resolves a real client `User`: accepts an optional `client_id` to link
  an existing client, or — using the lead's primary contact — finds an
  existing user by email, restores a soft-deleted one, or creates a new
  client account (`client` role assigned, welcome email queued, same
  restore-if-trashed dedupe pattern as `UserController::store`). The
  resulting `client_id` is set on the Quote and on `leads.converted_client_id`
  (no longer a stub). Added a 422 guard against converting an already-converted lead.
- Quote conversion now copies the lead's interested services onto the Quote
  as real `QuoteItem` rows (service, price, tax) with subtotal/tax/total
  computed the same way `QuoteController::store` does; falls back to the flat
  budget only when the lead has no services attached.
- Added `PATCH /leads/{lead}/followups/{followup}/complete`
  (`LeadController::completeFollowup`) and exposed `followups` (and
  `interested_service_ids`) on `LeadResource`. The frontend's follow-up tab
  now sends `due_at` (matching the backend) and the "Pending Follow-ups"
  panel and "mark complete" button call the real API instead of mutating
  fake local state.
- Stage-change and sales-exec/sales-head reassignment now log their activity
  via the real `POST /leads/{id}/activities` endpoint instead of the
  no-op `activities` field.
- Both CRM pages now render the real service catalog (`GET /services`) for
  "Interested Services" checkboxes, and `interested_service_ids` is sent/read
  correctly on create, update, and display.
- Added the Convert-to-Quote modal's client-selection UI: "create from
  contact" (default, shows the primary contact that will become the client)
  vs. "use existing client" (dropdown sourced from the client directory
  report). Submit is disabled until a valid client is resolvable.
- `LeadSourceController::destroy()` now blocks deletion (422) when the source
  is attached to existing leads, matching `LeadStageController`'s behavior.
- Removed all dead mock-data code from both CRM pages.
- Added an error banner on the CRM list page when the leads fetch fails.
- Updated `Sprint2CrmTest::test_convert_lead_to_quote` to give its fixture
  lead a primary contact with an email (now required to auto-create a client).

### Remaining issues
- None blocking. Two pre-existing, unrelated test failures were found while
  running the full suite (`Sprint8AReportsTest::test_quote_funnel_calculations`,
  `Sprint9NotificationTest::test_welcome_email_sent_on_user_creation` — the
  latter is a test bug, asserting `Mail::sent` on a mailable that's
  intentionally `->queue()`d) — both belong to the Reports and Settings/
  Notifications modules respectively and are left for when those modules are audited.
- `lead_tags` still has no API/UI (low priority — not referenced by any
  visible feature, unlike `lead_followups` which had a UI expecting it).

### Performance improvements
- None needed this module — list/detail queries were already reasonably scoped.

### UI/UX improvements
- Convert-to-Quote now clearly communicates what will happen to the client
  account (name/email shown up front) instead of silently doing nothing.
- "Convert to Quote" button is replaced with a plain status line once a lead
  is converted, instead of allowing repeat clicks that used to silently
  duplicate quotes.
- Follow-ups now actually disappear from "Pending" once marked complete.

### Verification
- Live end-to-end test (real local stack, no mocks): created a lead with
  contact + 2 services → converted to quote → verified in DB that a new
  `client` User was created with the correct name/email/role, the quote's
  `client_id`/items/totals were correct, and `leads.converted_client_id` was
  set. Re-opening the same lead confirmed the idempotency guard blocks a
  second conversion. Logged a follow-up (verified `lead_followups` row
  created with correct due date), marked it complete (verified
  `is_completed`/`completed_at` persisted), and created a second lead via the
  create-lead form with a real catalog service + contact (verified in DB).
- `php artisan test` (full suite): 156/158 passing; the 2 failures are
  pre-existing and unrelated to this module (see "Remaining issues").
- `npx tsc --noEmit`: clean across the whole frontend.
- `php -l` clean on all changed backend files.

### Next recommended module
Quotes & Invoicing — the convert-to-quote flow now produces a properly
itemized, client-linked draft quote, so that module can be audited assuming
quotes arriving from CRM are well-formed.

---

## Module: Quotes & Invoicing

**Status:** ✅ production-ready (completed 2026-07-09)

### Scope
Quote create/edit/approve/send/PDF, quote→invoice conversion, invoice
create/edit/approval workflow/payments/PDF, credit notes, recurring invoice
fields.

### Findings (root causes, before fixes)
1. **Invoice creation was completely broken against the real API.** The
   frontend sent `client_name`/`client_email` (free text) and never sent the
   required `currency_id`; the backend requires `client_id` (FK) and
   `currency_id`. Every real `POST /invoices` call 422'd — masked because the
   page caught the error and silently persisted a synthetic invoice to
   `localStorage` (`creativals_invoices`) and redirected as if it succeeded.
2. **Discount was silently dropped on every quote and invoice item.**
   Frontend sent `discount_percentage`; backend validation only reads
   `discount_percent`. Every item was saved with 0% discount regardless of
   what the user entered, with no error surfaced anywhere.
3. Quote "internal comments" field (`internal_comments`) didn't match the
   backend column (`internal_notes`) — silently discarded on save and always
   blank on reload.
4. **Invoice list/detail pages referenced resource fields that don't exist**:
   `balance_amount` (real field: `due_amount`) broke the "Record Payment"
   button visibility and outstanding-balance display against real data;
   `client_name`/`client_email` (real: nested `client.name`/`client.email`);
   `notes` (real: `client_notes`/`internal_notes`).
5. **The real invoice approval workflow (`submit-approval`→`review`→
   `approve`→`reject`, role-gated) was entirely unreachable from the UI.**
   The frontend had no API wrappers for these endpoints and instead called
   generic `update({status})`, which bypassed role gates, never wrote
   `InvoiceApproval` audit rows, and never triggered `approve()`'s side
   effects (auto-create Project, convert Lead, assign client role).
6. Frontend `Invoice['status']` type was missing 4 of 10 real backend
   statuses (`pending_review`, `pending_approval`, `approved`, `void`) —
   invoices in those states fell through every badge/filter/board branch.
7. **`invoices/page.tsx` and `invoices/[id]/page.tsx` were largely
   localStorage-driven** — real API calls were wrapped in
   `try { ... } catch { /* ignore */ }` with localStorage as the actual
   source of truth for list, detail, payment recording, and delete. This
   silently masked all of the above breakage.
8. N+1 query: `items.service` was never eager-loaded in either
   `QuoteController` or `InvoiceController` (only `items` was), so every
   list/detail response lazy-loaded each line item's service individually.
9. Dead code: `QuoteController::generatePdf()` (~130 lines of inline
   HTML-building, registered at `GET quotes/{id}/pdf`) duplicated the real,
   wired `downloadPdf()` (DomPDF) path — and the frontend's
   `quotesApi.downloadPdf()` was actually calling this dead HTML endpoint by
   mistake, expecting a PDF blob and getting HTML.
10. **Authorization inconsistency**: `QuoteController::submitApproval` and
    `InvoiceController::review/approve/reject` used inline ad-hoc role
    checks instead of the Policy layer. `CreditNoteController` had **no
    authorization at all** — any authenticated user could create a credit
    note against any invoice.
11. **No overpayment guard**: `recordPayment` accepted any amount, allowing
    `paid_amount` to exceed `total_amount` with no reconciliation.
12. **No guard against invalid/duplicate quote conversion**: any quote
    (including `draft`) could be converted, and the same quote could be
    converted to multiple invoices — `store()` only flipped
    `Quote.status = 'converted'` as a side effect, never checked it first.
13. Recurring invoice fields (`is_recurring`, `recurring_interval`,
    `recurring_end_date`) existed as DB columns but were never in the
    backend's validated field list — recurring setup from the UI was a no-op.
14. No "Convert to Invoice" affordance on the quote detail page — the only
    path was a dropdown on the invoice-create page that re-typed quote data
    client-side into the (broken) invoice payload.

### Fixes applied
**Backend:**
- `items.service` eager-loaded everywhere `items` is (index/show/post-store/
  post-update) in both controllers — N+1 fixed.
- Removed `QuoteController::generatePdf()` and its route; frontend's
  `downloadPdf()` now correctly calls `/quotes/{id}/download-pdf`.
- Added `QuotePolicy::submitApproval`, `InvoicePolicy::review/approve/reject`
  abilities (same effective role logic, moved into the policy layer) and
  switched the controllers to `Gate::authorize`. Added `CreditNotePolicy`
  (gated on `invoices.view`/`invoices.view_all`/`invoices.create`) and wired
  it into `CreditNoteController`.
- `recordPayment` now rejects (422) if `amount` would push `paid_amount`
  past `total_amount` (small epsilon for float rounding).
- `InvoiceController::store` now rejects (422) converting a quote that isn't
  `approved`/`sent`, or that's already been converted to another invoice.
- Added `is_recurring`/`recurring_interval` (`daily|weekly|monthly|yearly`)/
  `recurring_end_date` to validation + persistence in `store`/`update`.

**Frontend:**
- `api.ts`: `Quote`/`Invoice`/item interfaces aligned to the real backend
  contract (`discount_percent`, `internal_notes`, `client_notes`,
  `client_id`+`currency_id`, `due_amount`, full status enums). Added
  `invoicesApi.submitApproval/review/approve/reject` wrappers.
- `quotes/create/page.tsx`: field names fixed; added a client picker for
  quotes not originating from a lead; silent-fallback mutations replaced
  with real error toasts.
- `quotes/[id]/page.tsx`: added "Convert to Invoice" button for
  `approved`/`sent` quotes → `/invoices/create?quote_id={id}`.
- `invoices/create/page.tsx`: rebuilt — real client picker (`client_id`),
  real currency picker (`currency_id`), `client_notes`/`internal_notes`,
  `discount_percent`, working recurring fields, and real error surfacing
  instead of a localStorage fallback that redirected as if creation
  succeeded.
- `invoices/page.tsx` / `invoices/[id]/page.tsx`: removed all
  `creativals_invoices` localStorage shadow logic — both now read/write
  only through the real API, matching how the quotes pages already worked.
  Fixed all stale field references; replaced the fictitious
  `approval_status`/generic `update({status})` UI with real
  submit-approval/review/approve/reject actions gated by actual invoice
  status; fixed "Record Payment" visibility to check `due_amount`.

### Remaining issues
- `InvoiceResource` doesn't return an `approvals` array (`InvoiceApproval`'s
  shape — `action`/`actor_id`/`notes` — isn't a clean 1:1 mirror of
  `QuoteApproval`), so the invoice approval-history timeline UI will show
  "no actions logged" until that resource is extended. Low priority — the
  workflow itself (status transitions, role gates, audit rows) works
  correctly; only the frontend timeline display is incomplete.
- No scheduled job sweeps invoices to `overdue` on a timer — status is only
  recalculated reactively on payment save/delete. An unpaid invoice that
  never receives a payment event won't flip to `overdue` until something
  touches it. Flagged for the Reports or a future "scheduled tasks" pass,
  not fixed here (out of scope for this module's UI/data-correctness focus).
- Same 2 pre-existing, unrelated test failures noted in the CRM module
  (Reports and Settings/Notifications) — untouched, still pending those
  modules' audits.

### Performance improvements
- Fixed `items.service` N+1 across quote/invoice list and detail responses.

### UI/UX improvements
- Invoice status badges/filters/board now cover the full 10-state enum
  instead of silently dropping 4 states.
- Real approval-workflow buttons replace the previous no-op status toggle.
- Errors on quote/invoice creation now surface to the user instead of being
  swallowed and masked by a localStorage fallback.

### Verification
- `php artisan test` (full suite): 156/158 passing — same 2 pre-existing,
  unrelated failures as the CRM module baseline; no regressions from these
  changes. Targeted quote/invoice test files (`Sprint3CatalogQuoteTest`,
  `Sprint4InvoiceTest`, `Sprint9InvoiceFeaturesTest`): 43/43 passing (one
  test updated to hit the real `download-pdf` endpoint instead of the
  removed dead `generatePdf` route).
- `php -l` clean on all changed backend files; `php artisan route:list`
  confirms clean route registration with no leftover dead route.
- `npx tsc --noEmit`: clean across the whole frontend.
- Not manually browser-tested end-to-end per Low Token Mode instructions —
  user will test manually.

### Next recommended module
Projects & Tasks — invoice approval now correctly auto-creates a Project
stub on `approve()`, so that module can be audited assuming projects
arriving from Invoicing are well-formed.

---

## Module: Projects & Tasks

**Status:** ✅ production-ready (completed 2026-07-09)

### Scope
Project list/detail/create, project members, milestones, project documents,
task list/detail/create/board, task comments, task time-logging, task
attachments, and the task detail slide-over (status/priority/assignee,
subtasks, comments, time logs, attachments).

### Findings (root causes, before fixes)
1. **Project create form's "Client" picker listed Leads, not Users.** It sent
   a Lead's id as `client_id`, but the backend requires `client_id` to be a
   real `users.id` (FK-checked) — every real submission either 422'd or, worse,
   silently linked the project to whatever unrelated user happened to share
   that numeric id.
2. `client_name`, `invoice_number`, `manager` (full object), and `departments`
   were all sent in the create payload but **none of them are accepted fields**
   on `ProjectController::store` — silently discarded, matching the pattern
   already flagged in CRM/Invoicing.
3. **`ProjectResource` eager-loaded `client`/`manager` but never returned
   them** — only bare `client_id`/`manager_id`. Every page that displayed
   "Client: X" or a manager name was reading a field (`client_name`,
   `manager.name`) the API never sent.
4. **Members list on the project detail page crashed on real data.** It
   treated each `project.members[]` entry as a flat `User` (`member.name`,
   `member.email.split('@')`), but the real shape is a `ProjectMember` row
   with a **nested** `user: {id, name, email}` — `member.email` is `undefined`
   on real data, so `.split('@')` throws. The "is this the manager" check
   also compared the wrong id (`member.id`, the pivot row's own id, against
   `project.manager_id`, a user id) and the role badge was hardcoded off
   `member.id === 2` instead of the real `role` column.
5. **"Add Member" role picker sent capitalized values** (`Manager`/`Lead`/
   `Member`) but the backend's validation is a case-sensitive
   `in:manager,lead,member,viewer` — every add-member submission with a role
   selected failed validation.
6. **Milestones tab was entirely disconnected from the real schema.** Frontend
   read `ms.title`/`ms.is_completed`; the backend (`MilestoneResource`)
   returns `name` and `status`+`completion_percentage` (no `is_completed` at
   all) — milestone names showed blank, completion state and the "Milestones
   Hit" stat were permanently wrong (always 0), and there was **no UI at all**
   to create or complete a milestone despite `MilestoneController` already
   having full CRUD.
7. **Task reassignment silently didn't work.** Frontend used `assignee_id`
   everywhere; the real field is `assigned_to`. This meant: the Assignee
   dropdown in the task detail panel never showed the real assignee, changing
   it via that dropdown was a no-op (backend ignores the unrecognized key),
   and the Tasks page's "Assignee" filter always returned zero results.
8. **Subtasks were 100% fake.** The task detail panel's "Subtasks" checklist
   read/wrote a `task.subtasks` field the backend has no concept of at all —
   `TaskController::update` has no `subtasks` in its validation whitelist, so
   every add/toggle/remove silently vanished on reload. Meanwhile the backend
   already supports real child tasks via `parent_task_id` with zero UI wired
   to it.
9. **"Budget Burned" showed a fabricated number.** The sidebar stat computed
   `hoursSpent * 2500` (a hardcoded rate, per the code's own comment) instead
   of using the real cost data the page was already fetching for the
   Profitability tab — the two panels could show wildly different, both
   partially-fake, cost figures for the same project.
10. Internal sprint numbers leaked into user-facing copy: "Sprint 7 Stub
    Details" and a "(Sprint 10)" code comment sat next to real feature labels
    on the Profitability and Documents tabs.
11. Dead code: `MOCK_PROJECTS`, `MOCK_PROJECT_DETAIL`, `MOCK_PROJECT_TASKS`,
    `MOCK_PROJECT_MILESTONES`, `MOCK_PROFITABILITY` — all unused. One,
    `MOCK_PROJECT_TIMESHEETS`, was actually wired in as the timesheets query's
    default value, inconsistent with the same file's own documented policy
    (right above it, for the `project` and `profitability` queries) of never
    defaulting to fake data.
12. Project `status` accepted any string up to 50 characters
    (`nullable|string|max:50`) with no enum check, unlike every other status
    field in this module (Task, Milestone) — a bad status string from the
    board view or a future bug would persist silently instead of 422ing.

### Fixes applied
**Backend:**
- `ProjectResource` now returns nested `client`/`manager`/`invoice` objects
  (id/name/email, matching the convention already used by `InvoiceResource`);
  `ProjectController` eager-loads `invoice` alongside the existing
  `client`/`manager` loads.
- `Project.status` validation tightened to the real enum
  (`planning,in_progress,active,on_hold,completed,cancelled`) in both
  `store` and `update`.
- `TaskController::index` now accepts a `parent_task_id` filter, so the
  frontend can list a task's real subtasks.

**Frontend:**
- `api.ts`: `Project`/`Task`/`Milestone`/new `ProjectMember` interfaces
  rewritten to match the real API contract (`assigned_to` not `assignee_id`,
  `client`/`manager`/`invoice` nested objects, `Milestone.name`/`status`
  instead of `title`/`is_completed`); removed the phantom `Subtask` interface;
  added `projectsApi.createMilestone/updateMilestone/deleteMilestone`.
- Projects list page: client picker now lists real client-role Users (same
  role-lookup pattern as Invoices' client picker), removed the non-functional
  Departments picker, removed ~100 lines of dead mock data, added an error
  banner when the list fails to load, actionable empty state.
- Project detail page: Milestones tab fixed to the real fields, plus a new
  "Add Milestone" inline form and one-click complete/incomplete toggle (using
  the now-existing milestone CRUD endpoints); Members list fixed to read the
  nested `user` object and the real `role` field (no more crash, no more
  hardcoded id-based role guessing); Add Member role values now lowercase to
  match backend validation; "Budget Burned" now uses the real profitability
  total cost; removed all dead mock data; "Sprint 7"/"Sprint 10" labels
  rewritten in plain language.
- `TaskDetailSlideOver`: assignee field fixed to `assigned_to`; Subtasks tab
  rewired to real child tasks (`parent_task_id`) with real create/toggle/
  delete instead of a phantom local-only field.
- Tasks page: fixed the Assignee filter (`assigned_to` not `assignee_id`),
  actionable empty state.

**Onboarding (new standing requirement, see top of this file):**
- Added reusable `HelpIcon` (ⓘ hover tip / click-to-expand what-why-when
  popover) and `HowToUseGuide` (header button + auto-opens once per browser
  on first visit) components under `frontend/src/components/ui/`.
- Wired both into Projects (list + detail) and Tasks (list + detail
  slide-over): guide content for each page, help tips on the Client/Manager/
  Budget fields, Milestones section, and Profitability tab.

### Remaining issues
- No UI to attach/detach Departments on a project — the backend has no
  endpoint for it either (only a `project_departments` pivot with no
  controller action). Removed the non-functional picker rather than build a
  new endpoint for it; low priority unless a real reporting need surfaces.
- The `client`/`tasks.view` permissions granted to the `client` role in
  `RolesPermissionsSeeder` appear unused — client-portal users are served by
  `PortalController`'s own ownership checks, not `ProjectPolicy`/`TaskPolicy`.
  Harmless, not fixed (permission-cleanup housekeeping, not a bug).
- Same 2 pre-existing, unrelated test failures noted in the CRM/Invoicing
  modules (Reports and Settings/Notifications) — untouched.

### Performance improvements
- None needed beyond the existing eager-loading; the new `invoice` eager-load
  piggybacks on the same `with()` calls already in place.

### UI/UX improvements
- Milestones are now a real, usable feature (create + complete) instead of a
  read-only display of fields that didn't match the API.
- Subtasks now persist for real instead of silently vanishing on reload.
- Client/Manager names and Budget Burned figures are now real data everywhere
  they're shown, instead of blank fields or a fabricated number.
- First onboarding pass: ⓘ help on key fields, a "How to Use" guide per page
  (auto-shown on first visit), and actionable empty states for Projects and
  Tasks.

### Verification
- `php artisan test` (full suite): 156/158 passing — same 2 pre-existing,
  unrelated failures as the CRM/Invoicing baseline; targeted `Project`/`Task`/
  `Milestone` test files: 65/65 passing. No regressions.
- `php -l` clean on all changed backend files.
- `npx tsc --noEmit`: clean across the whole frontend.
- Not manually browser-tested, per the user's explicit instruction for this
  and all future modules — user tests every module manually.

### Next recommended module
Timesheets — Projects & Tasks now expose correct `project_id`/`task_id`
linkage and real time-log endpoints, so Timesheets can be audited assuming
the records it aggregates are well-formed.

---

## Module: Timesheets

**Status:** ✅ production-ready (completed 2026-07-09)

### Scope
Self-service time logging (Weekly Grid + List View), week submission,
individual entry submission, and the PM/founder approval queue (single +
bulk approve/reject). Also touches the shared `GET /timesheets` endpoint
used by the Task Detail slide-over's "Time Logs" tab (Tasks module).

### Findings (root causes, before fixes)
1. **The `employee` role — the most common role in the system — could log
   time but could never view it.** `RolesPermissionsSeeder` granted
   `employee` only `timesheets.log`, not `timesheets.view`. The list endpoint
   (`GET /timesheets`) gates on `TimesheetPolicy::viewAny()`, which requires
   `timesheets.view` or `timesheets.view_all` — with neither, every plain
   employee got a 403 loading their own Timesheets page. The frontend
   silently swallowed the failure to an empty list, so this looked exactly
   like "no time logged yet" instead of a broken permission grant. This is
   almost certainly the core bug this module's audit was commissioned to find.
2. **The approvals queue silently missed every entry not dated in the
   current calendar week.** `TimesheetController::index()` defaults to
   `date BETWEEN thisWeek.start AND thisWeek.end` whenever no `start_date`/
   `end_date` is passed — and neither the self-service Timesheets page nor
   the Approvals page ever passed one. Net effect: a PM reviewing on Monday
   would never see a Friday-dated submission from the prior week; the Weekly
   Grid's Prev/Next Week navigation always rendered empty for any week other
   than the real current one; and List View's search/filters silently only
   ever searched the current week, despite having no date-scoping UI that
   would suggest that limitation to the user.
3. Same root cause broke the Task Detail slide-over's "Time Logs" tab
   (Tasks module): it called `timesheetsApi.list({ task_id: taskId })`, but
   `index()` never read `task_id` from the request at all, so the tab showed
   the *current user's current-week* entries across all tasks — not this
   task's history — whenever it managed to show anything.
4. `currentWeekRefDate` was hardcoded to `new Date('2026-06-11')` — a leftover
   test/mock date — instead of `new Date()`. Every real user opened the page
   already looking at a specific week in the past rather than the actual
   current week.
5. Dead mock data: `MOCK_PROJECTS`/`MOCK_TASKS`/`MOCK_TIMESHEETS` (Timesheets
   page) and `MOCK_PROJECTS`/`MOCK_SUBMITTED_TIMESHEETS` (Approvals page) —
   defined but never referenced outside their own declarations, plus several
   unused icon/component imports (`EmptyState`, `SkeletonTable`, `Search`,
   `Clock`, `Users`, `Folder`, `Calendar`, `CheckCircle2`, `AlertCircle`,
   `FileText`) left over from whatever draft last touched these files.
6. Approve actions (single and bulk) used the confirm dialog's `'danger'`
   variant — the same red/destructive styling used for deleting a timesheet
   — even though approving isn't a destructive action.
7. Grid cells for **already-submitted/approved/rejected** entries opened the
   same fully-editable "Log Time" modal as a draft cell. Saving or deleting
   through that modal would 422/403 against `TimesheetPolicy::update`/
   `delete` (own-draft-only), with no error surfaced — the Save/Delete
   buttons just silently did nothing from the user's perspective.
8. Projects/Tasks/Users pickers on both pages called `list()` with no
   `per_page` override, so they silently truncated to the backend's default
   15 rows — a company with more than 15 projects or tasks would see an
   incomplete dropdown on the Log Time modal and filters with no indication
   anything was missing.
9. Both pages re-implemented the exact `hours_logged`/`is_billable` →
   `hours`/`billable` mapping and `{data: [...]}` unwrapping that
   `timesheetsApi.list()` already does internally (`mapTimesheetBackendToFrontend`)
   — dead duplicate logic that also swallowed fetch errors into an empty
   array with no error state.
10. No way to submit a single draft entry from List View — the only submit
    path was the Grid's "Submit Week for Approval," which submits every
    draft in the visible week at once, with no per-entry alternative if a
    user wanted to hold one entry back.
11. Empty states gave no next action ("No timesheets found" with no button).

### Fixes applied
**Backend:**
- `RolesPermissionsSeeder`: added `timesheets.view` to the `employee` role.
  Re-ran the seeder against the local dev database (idempotent —
  `syncPermissions`/`firstOrCreate`, no data loss) so the fix is live, not
  just checked in.
- `TimesheetController::index()`: added a `task_id` filter, and an `all=1`
  bypass for the current-week default (also bypassed automatically when
  `task_id` is given, since a task-scoped log view should show that task's
  full history, not just this week). Explicit date filters (`start_date`/
  `end_date`) continue to work exactly as before.

**Frontend:**
- Removed all dead mock data and unused imports from both pages.
- Fixed `currentWeekRefDate` to initialize to `new Date()`.
- Both pages now fetch with `{ all: 1 }` and trust `timesheetsApi.list()`'s
  existing mapping/unwrapping instead of re-implementing it — this also
  fixes Grid week navigation (Prev/Next Week now actually loads that week's
  data) and makes the Approvals queue see every pending entry regardless of
  when it was logged.
- Projects/Tasks/Users picker queries now request `per_page: 200`–`500`
  instead of the default 15.
- Added `isError` handling on every query with a visible error banner
  instead of a silent empty state.
- Grid cell clicks on a non-draft entry now show a toast ("This entry is
  submitted/approved/rejected and can no longer be edited") instead of
  opening a modal whose Save/Delete would silently fail.
- Added a per-row "Submit" action for draft entries in List View, alongside
  the existing week-level bulk submit.
- Approve confirm dialogs (single + bulk) now use the `'info'` variant
  instead of `'danger'`.
- Approvals page: added a loading skeleton and a proper `EmptyState` (was
  previously an inline "no results" table row with no loading state at all,
  despite `isLoading` being fetched and never used); KPI labels "Approved
  This Week"/"Rejected Log Blocks" renamed to "Total Approved"/"Total
  Rejected" now that the underlying data is genuinely all-time, not
  accidentally-current-week.
- Added `HelpIcon`s (page title, Billable checkbox) and `HowToUseGuide`s to
  both the Timesheets and Timesheet Approvals pages.
- List View empty state now offers a "Log Time" action instead of just text.

### Remaining issues
- No pagination on the timesheets list — both pages now fetch a user's (or,
  for PM/founder, everyone's) full history in one request. Fine at current
  scale; revisit if the table grows large enough to matter.
- `department_head` has `timesheets.view` but not `timesheets.log` (can
  review but not log their own time) — left as-is; plausible by design
  (department heads may not bill hours directly) rather than a clear bug,
  unlike the `employee` gap.
- Same 2 pre-existing, unrelated test failures noted in every prior module
  (Reports and Settings/Notifications) — untouched.

### Performance improvements
- None beyond what the correctness fixes already required (removing
  duplicate client-side re-mapping logic).

### UI/UX improvements
- Weekly Grid navigation (Prev/Next Week) and List View search now actually
  work across all of history instead of being silently confined to the
  current calendar week.
- The approval queue can no longer silently miss older pending submissions.
- Locked (non-draft) entries can no longer be opened into a modal that fails
  silently on save.
- Onboarding: help icons + "How to Use" guides on both pages; actionable
  empty states.

### Post-fix regression found and corrected
The first pass of the `res.data.data` simplification (see "Fixes applied")
introduced a runtime bug that only surfaces in the browser, not in `tsc`:
the global axios response interceptor (`frontend/src/lib/api.ts`) only keeps
the `{data, meta}` envelope when the response carries pagination metadata.
`GET /timesheets` never paginates (`TimesheetController::index()`/`pending()`
use `->get()`, not `->paginate()`), so the interceptor always unwraps it to a
flat array — meaning `timesheetsApi.list()` returns `res.data` as
`Timesheet[]` directly, not `{data: Timesheet[]}`. `res.data.data` was
therefore `undefined`, which React Query rejects ("Query data cannot be
undefined"). Fixed by reading `res.data` in all three call sites
(Timesheets page, Approvals page, and `TaskDetailSlideOver`'s Time Logs
tab — the last one had carried this same latent bug since the Tasks module
was audited, now fixed as a byproduct) and by correcting `timesheetsApi.list()`'s
declared return type in `api.ts` from `{data: Timesheet[], meta?}` to
`Timesheet[]` so it can't mislead the next caller the same way. `/projects`
and `/tasks` are unaffected — both paginate, so they keep the envelope and
correctly use `res.data.data`.

### Verification
- `php artisan test` (full suite): 156/158 passing — same 2 pre-existing,
  unrelated failures as every prior module's baseline; targeted
  `Sprint5ProjectTaskTimesheetTest`: 26/26 passing. No regressions.
- `php -l` clean on all changed backend files.
- `npx tsc --noEmit`: clean across the whole frontend.
- Re-ran `RolesPermissionsSeeder` against the local dev database to apply
  the `employee` → `timesheets.view` grant to existing users (additive,
  no data loss — per this project's database-safety rules).
- Not manually browser-tested, per the user's explicit instruction — user
  tests every module manually.

### Next recommended module
Attendance — Timesheets now correctly separates "own logged hours" from
"PM approval queue" with real, un-truncated date ranges, so Attendance
(which likely reuses similar day-based logging patterns) can be audited
against a known-good reference implementation.

---

## Module: Attendance

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
Self-service clock-in/clock-out, monthly attendance summary + calendar, the
HR-facing Team Registry (live presence), leave request/approval, and the
corporate holiday calendar. Backed by `AttendanceController` and the
dual-purpose `LeaveController` (leave requests *and* holidays).

### Findings (root causes, before fixes)
1. **The single most severe bug in this module: every HR-gated action was
   checking a role that has never existed.** `AttendanceController` and
   `LeaveController` gated Team Registry, attendance record edit/delete, leave
   approve/reject, and all holiday CRUD behind
   `hasAnyRole(['founder', 'director', 'hr_manager'])`. `RolesPermissionsSeeder`
   has never seeded a role called `hr_manager` — the real HR role is `hr`. Net
   effect: **every real `hr`-role user was silently locked out of the entire HR
   surface of this module** (Team Registry, leave approvals, holiday
   management, attendance corrections) and got a plain 403 with no indication
   why — only `founder`/`director` could actually do HR work here. This is the
   direct Attendance-module analog of the Timesheets module's `employee` role
   gap and is almost certainly the bug this audit was commissioned to find.
2. **Frontend/backend authorization were two independent, disagreeing guesses.**
   The page computed `isHR` by lowercase-matching role names against
   `['founder', 'admin', 'hr', 'hr_manager']` — a list that doesn't match the
   backend's `['founder', 'director', 'hr_manager']` in either direction:
   `director` users saw no HR UI at all despite the backend authorizing them,
   while `hr`-role users saw every HR button rendered (matches `'hr'` in the
   frontend list) only to have each one 403 on click (backend never checked
   `'hr'`). Neither side had any connection to the Spatie permission system
   used everywhere else in the app.
3. **Zero permission strings existed for this module.** No `attendance.*`,
   `leave.*`, or `holidays.*` entries in `RolesPermissionsSeeder` at all — the
   entire module bypassed the permission system that every other module
   (Timesheets, Payroll, Expenses, etc.) is built on, and no `AttendancePolicy`/
   `LeavePolicy`/`HolidayPolicy` existed; every authorization check was
   inline role-name string matching repeated 11 times across two controllers.
4. **No onboarding at all.** Neither `HelpIcon` nor `HowToUseGuide` — the
   shared components required on every module since Projects & Tasks — were
   present anywhere on the page, despite the standing rule at the top of this
   file.
5. **HR had no way to correct or backfill an attendance record from the UI.**
   `AttendanceController::update()`/`destroy()` existed and worked, and
   `attendanceApi.update()`/`.delete()` were declared in `api.ts`, but neither
   was ever called anywhere — the Team Registry tab was read-only. There was
   also no `store()` endpoint at all, so a missed clock-in on a past day could
   never be entered, even by HR.
6. **`worked_minutes` was computed but never surfaced.** The model's
   `getWorkedMinutesAttribute()` accessor worked correctly (used internally by
   `summary()`/`team()`), but without `$appends`, it never appeared in the JSON
   returned by `index()`/`clockIn()`/`clockOut()` — so the logs table had no
   way to show actual hours worked per day even though the data was right
   there.
7. **`clockIn()` queried the same row twice** (an unused `$existing` lookup
   immediately followed by an identical re-query) — dead, redundant work on
   every clock-in.
8. **`clockOut()`'s auto-downgrade to `'partial'` (worked < 5hrs) could clobber
   a status HR had manually set earlier the same day** (e.g. `'leave'`), since
   it unconditionally overwrote `status` with no check of what it currently was.
9. **`attendanceApi`/`leaveApi`/`holidaysApi` were the only API groups in
   `api.ts` with no generic type parameters at all** (implicit `any` on every
   response) — unlike every neighboring `*Api` object, so TypeScript had no
   way to catch a field-name mismatch between frontend and backend here, which
   is exactly the class of bug found in prior modules (Timesheets' `res.data`
   vs `res.data.data`, Projects' `assignee_id` vs `assigned_to`, etc.).
10. Holiday Calendar's year `<select>` was hardcoded to `2025/2026/2027` —
    would silently stop offering useful years once the calendar rolled past
    2027.
11. Empty states were inconsistent: some used `EmptyState` without an
    actionable `action` prop, and two ("Leave History", "Holiday Calendar")
    used a plain unstyled `<div>` instead of `EmptyState` at all, both
    violating this file's standing onboarding rule ("empty states must tell
    the user what to click, not just that there's nothing there").
12. Dead imports (`Coffee`, `Users`, `FileText`, `AlertCircle`, `formatCurrency`)
    left over from an earlier draft, never referenced anywhere in the file.

### Fixes applied
**Backend:**
- Added real permission strings to `RolesPermissionsSeeder`: `attendance.view`,
  `attendance.view_all`, `attendance.manage`, `leave.view`, `leave.view_all`,
  `leave.approve`, `holidays.manage`. Granted `attendance.view`/`leave.view`
  (own-record access) to every working role (`sales_head`, `sales_exec`,
  `project_manager`, `department_head`, `team_lead`, `employee`, `finance`,
  `hr`); granted the HR-oversight set (`attendance.view_all`,
  `attendance.manage`, `leave.view_all`, `leave.approve`, `holidays.manage`)
  explicitly to the real `hr` role. `founder` (all permissions) and `director`
  (all except a short excluded list) continue to receive everything
  automatically, as before. Re-ran the seeder against the local dev database
  (additive `syncPermissions`/`firstOrCreate` — no data loss).
- Added `AttendancePolicy`, `LeavePolicy`, `HolidayPolicy`
  (`backend/app/Policies/`), registered in `AppServiceProvider::register()`,
  following the same `before()`-grants-founder / permission-string pattern as
  `TimesheetPolicy`. Replaced all 11 inline `hasAnyRole([...])` checks across
  `AttendanceController` and `LeaveController` with `Gate::authorize`/
  `Gate::allows` calls against these policies — a real `hr` user (or any role
  later granted the same permissions) now actually gets the access the UI
  already implied they had.
- Added `AttendanceController::store()` — an HR-only (`attendance.manage`)
  endpoint that upserts a record by `(user_id, date)`, for backfilling a
  missed clock-in or correcting a day's record; wired to `POST /attendance`.
- Fixed `clockIn()`'s duplicate query (one lookup instead of two).
- Fixed `clockOut()`'s status auto-downgrade to only fire when the current
  status is still `'present'` (the value this same endpoint set on clock-in),
  so it can no longer silently overwrite a status HR set earlier that day.
- Added `protected $appends = ['worked_minutes']` to `AttendanceRecord` so
  every JSON response (not just the manually-built `summary()`/`team()`
  payloads) includes computed worked minutes.
- `team()` now includes the attendance record's own `id` in its payload
  (needed by the new frontend edit/delete actions).

**Frontend:**
- Replaced the guessed-role-name `isHR` check with granular booleans read
  directly from the authenticated user's real `permissions` array
  (`user.permissions.includes('attendance.view_all')`, etc. — same idiom
  already used on the Reports page), one per actual capability
  (`canViewTeam`, `canManageAttendance`, `canViewAllLeave`, `canApproveLeave`,
  `canManageHolidays`) instead of one catch-all flag. The UI now always
  matches what the backend will actually authorize.
- Added `attendanceApi.create()` (typed) and wired it to a new "Add / Correct
  Record" modal: HR can pick any employee, a date, status, optional
  clock-in/out times, break minutes, and notes to backfill or correct a
  record. Added a per-row Edit (pencil) action in Team Registry that opens the
  same modal pre-scoped to that employee, and a per-row Delete action (wired
  to the previously-dead `attendanceApi.delete()`) with a confirmation modal.
- Added `HelpIcon`s (page title, Team Registry header) and a `HowToUseGuide`
  (page header, covering clock-in/out, leave requests, and the holiday
  calendar) — brings the module in line with the onboarding rule every module
  since Projects & Tasks has followed.
- Added a "Worked" column to the My Attendance logs table, now that
  `worked_minutes` is actually returned by the API.
- Fixed the Holiday Calendar year `<select>` to generate its options from the
  current year (`currentYear - 1` … `currentYear + 2`) instead of a hardcoded
  2025–2027 range.
- "Leave History" and "Holiday Calendar" empty states converted from plain
  `<div>` text to `EmptyState`, each with an actionable button
  ("Request Leave" / "Add Holiday") gated by the same permission as the
  feature itself.
- Added full TypeScript types (`AttendanceRecord`, `AttendanceSummary`,
  `TeamAttendanceEntry`, `LeaveType`, `LeaveRequest`, `Holiday`,
  `LaravelPaginatedResponse<T>`) to `attendanceApi`/`leaveApi`/`holidaysApi` in
  `api.ts`, replacing the implicit `any` every method previously returned —
  matches the typed convention used by every neighboring `*Api` group.
  Simplified the page's defensive `Array.isArray(...) ? ... : ...data.data`
  unwrapping (now that the response shape is known and typed) to a direct
  `res.data?.data || []`.
- Removed dead imports (`Coffee`, `Users`, `FileText`, `AlertCircle`,
  `formatCurrency`).

### Remaining issues
- No `LeaveBalance`/`leave_balances` tracking exists — `LeaveType.days_allowed`
  is defined but never enforced against how much leave a user has already
  taken, so nothing stops a request that exceeds the type's allowance. Not
  fixed here — it's a genuine feature gap (governance, not a broken promise
  the UI makes today), flagged for a future pass if the business needs it
  enforced.
- Approving a `LeaveRequest` does not automatically create/update an
  `AttendanceRecord` with `status='leave'` for the covered dates — the two
  systems are linked only by both independently supporting a `'leave'` status
  value. This means the "Leaves" stat on the My Attendance summary reflects
  manually-set attendance records, not automatically the outcome of approved
  leave requests, unless HR also sets those days via the new backfill/correct
  modal. Flagged as a real gap but out of scope to redesign here (would touch
  both controllers' side effects); worth a follow-up if HR reports this as a
  practical pain point.
- No dedicated Attendance report exists in the Reports module, and the main
  Dashboard has no "who's in today" widget despite `attendance/team` already
  serving exactly that data live — left for the Reports/Dashboard modules'
  own audits later in the plan.
- No `AttendanceResource`/`LeaveRequestResource`/`HolidayResource` API
  resource layer — records still serialize as raw Eloquent models (all
  columns, including `ip_address`, are exposed as-is). Consistent with how
  this module worked before and not a behavior change bug, so left alone
  rather than introducing a resource layer as an unrelated refactor.
- Zero test coverage existed for Attendance/Leave/Holidays before this audit
  and none was added — per this project's "no browser verification, use
  php -l / php artisan test / npx tsc --noEmit" instruction, writing new
  Sprint-style feature tests was treated as out of scope for this pass;
  flagged here in case a future session wants to backfill coverage.
- Same 2 pre-existing, unrelated test failures noted in every prior module
  (Reports and Settings/Notifications) — untouched.

### Performance improvements
- Removed `clockIn()`'s redundant duplicate database query.

### UI/UX improvements
- HR actions (Team Registry, leave approvals, holiday management, attendance
  corrections) now actually work for real `hr`-role users instead of 403ing
  silently.
- HR can now correct a wrong clock time or backfill a missed day directly from
  the UI instead of needing direct database access.
- Onboarding: help icons + a "How to Use" guide (first module pass for
  Attendance); actionable empty states on Leave History and Holiday Calendar.
- Worked hours are now visible per day in the attendance log table.
- Holiday year picker no longer goes stale after 2027.

### Verification
- `php artisan test` (full suite): 156/158 passing — same 2 pre-existing,
  unrelated failures as every prior module's baseline; no regressions from
  these changes.
- `php -l` clean on all changed/added backend files.
- `php artisan route:list` confirms clean registration of the new
  `POST /attendance` route with no conflicts against `/attendance/clock-in`
  or `/attendance/clock-out`.
- Verified via Tinker that the permission fix actually resolves correctly:
  a real `hr`-role user now passes `viewTeam`/`manage`/`approve` checks that
  previously always failed (phantom `hr_manager` role), while a plain
  `employee` user correctly retains own-record access without team-level
  access.
- `npx tsc --noEmit`: clean across the whole frontend.
- Not manually browser-tested, per the user's explicit instruction — user
  tests every module manually.

### Next recommended module
Expenses — Attendance's HR-oversight pattern (real permission strings +
policies replacing inline role checks) is now the reference implementation
for any module still using ad-hoc role-name authorization; worth checking
whether Expenses has the same class of gap during its audit.

---

## Module: Expenses

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
Expense create/edit/delete, the submit → approve/reject → reimburse workflow,
the Approvals Desk, the vendor directory (`VendorController`), expense
categories (read-only dropdown), receipt/attachment handling, the audit
timeline, and PDF voucher download. (The Expense Breakdown Report under
`reports/expenses` is left for the Reports module's own audit — see
"Remaining issues".)

### Findings (root causes, before fixes)
1. **Same class of bug as Attendance's `hr_manager` gap, this time hitting
   `director`.** `RolesPermissionsSeeder` grants `director` every permission
   except a short excluded list (`recovery.restore`, `roles.manage`,
   `payroll.approve`) — `expenses.view_all`/`expenses.approve` are **not**
   excluded, so a director genuinely holds both. But `ExpensePolicy` and
   `ExpenseController::index()`'s row-scoping only ever checked
   `hasRole('finance')` (view/update/delete) or `hasRole('finance')` alone
   (approve) — never the permission strings the seeder had already granted.
   Net effect: **a real `director` user could not see, approve, or manage any
   expense they didn't personally submit or manage as a project's PM** —
   despite the seeder's clear intent that directors have near-founder-level
   oversight. `VendorController` had the identical gap on vendor CRUD
   (`hasAnyRole(['finance', 'founder'])`, no `director`).
2. **Vendor create/update was unconditionally broken.** The "Manage Vendors"
   form (embedded in the Expenses page) never collected `currency_id` at all,
   but `VendorController::store`/`update` validate it as
   `['required', 'exists:currencies,id']` — every vendor create or edit
   submitted through the UI 422'd, masked only because the mutation's
   `onError` quietly set an inline validation message instead of throwing.
3. **Any authenticated user could set an expense's `status` directly on
   create/update**, bypassing the entire submit → approve → reimburse
   workflow (e.g. `POST /expenses` with `status: reimbursed`). The dedicated
   `submit`/`approve`/`reject`/`reimburse` endpoints already existed and were
   the only UI-reachable path, but the raw field was still accepted and
   validated as free-form input on `store`/`update` — a real workflow-bypass
   hole, not just an unused parameter.
4. **`approve()` had no status guard**, unlike `reject()`/`submit()`/
   `reimburse()` (each of which checks the current status before acting). An
   already-`approved`, `reimbursed`, or `draft` expense could be re-approved
   at any time, silently overwriting `approved_by`.
5. **Vendor deletion had no in-use guard.** `vendor_id` on `expenses` is
   `nullOnDelete()`, so deleting a vendor still referenced by expense records
   silently orphaned them — the same class of gap already fixed for
   `LeadSourceController::destroy()` in the CRM module.
6. **The "Vendor / Merchant" field on the Log Expense form was marked
   required**, even though the backend's `vendor_id` is `nullable` and both
   seeders (`ProductionDemoSeeder`, `PayrollExpenseSeeder`) create real
   vendor-less overhead expenses (rent, etc.) — a real user could never log a
   legitimate vendor-less expense through the UI.
7. **The expense/vendor Currency picker was hardcoded** to two guessed
   options (`value="1"` → INR, `value="2"` → USD) instead of the real,
   platform-configured currency list (`GET /settings` →
   `currencies`) that Quotes/Invoices already use — a currency whose real id
   isn't 1 or 2 was unselectable, and a currency later deactivated would
   still silently appear as choosable.
8. **The Approvals Desk showed Approve/Reject buttons to every viewer**,
   regardless of whether they actually had authority over that expense.
   Because `index()`'s row-scoping already limits a non-privileged user to
   their own submissions, this mostly surfaced as an employee's own
   `submitted` expense appearing in "Approvals Desk" with Approve/Reject
   buttons that would always 403 if clicked.
9. **Approving an expense prompted for "comments" and silently discarded
   them** — `handleApproveAction` asked the same "Enter comments for this
   approval/rejection" prompt for both actions, but `approveExpense(id)`
   takes no notes/comment parameter at all (there's no backing DB field);
   only `rejectExpense`'s `rejection_reason` is real.
10. Dead code: `localExpenses`/`setLocalExpenses`/`localVendors`/
    `setLocalVendors` state, seeded from `MOCK_EXPENSES`/`MOCK_VENDORS` but
    never read or written anywhere else in the file — `MOCK_CATEGORIES`/
    `MOCK_PROJECTS` were also used as permanent query fallbacks (not just
    initial state), same "looks like real data during an outage" masking
    pattern already flagged and removed in every prior module. Also 5 unused
    lucide icon imports (`Check`, `Calendar`, `DollarSign`, `RefreshCw`,
    `SlidersHorizontal`).
11. Dead/unreachable code: `reject()`'s status guard accepted
    `'pending_approval'` — a status value that has never existed anywhere
    else in the schema, model, or frontend enum.
12. **Zero onboarding.** None of the three expense-related pages (list,
    detail, and by extension the embedded vendor modal) had a `HelpIcon` or
    `HowToUseGuide`, unlike every module since Projects & Tasks.
13. The projects picker on the Log Expense form had no `per_page` override,
    silently truncating to the backend's default 15 rows — same class of gap
    already fixed in Timesheets.

### Fixes applied
**Backend:**
- `ExpensePolicy`: `view`/`update`/`delete` now check
  `hasRole('director') || hasPermissionTo('expenses.view_all')` instead of
  `hasRole('finance')` alone; `approve` checks
  `hasRole('director') || hasPermissionTo('expenses.approve')` (PM-of-project
  check unchanged). `ExpenseController::index()`'s row-scoping condition
  updated to match. No seeder changes were needed this time — unlike
  Attendance's `hr_manager`, the `expenses.view_all`/`expenses.approve`
  permission strings already existed and were already correctly granted to
  `director`; only the Policy/Controller weren't reading them.
- `VendorController::store`/`update`/`destroy`: added `director` to the
  allowed-roles check; `destroy()` now 422s with a clear message if the
  vendor has any linked expenses instead of silently orphaning them via
  `nullOnDelete()`.
- `store()`/`update()`: removed `status` from the accepted/validated fields
  entirely — a new expense always starts at `draft`; status can now only
  change via `submit`/`approve`/`reject`/`reimburse`.
- `approve()`: added a guard requiring the current status to be `submitted`
  (422 otherwise), matching the pattern already used by
  `reject`/`submit`/`reimburse`.
- `reject()`: dropped the dead `'pending_approval'` branch from its status
  guard (only `'submitted'` is ever real).
- Updated `Sprint6PayrollExpenseTest::test_expense_crud_and_approvals` to
  submit an expense via the real `POST /expenses/{id}/submit` endpoint
  instead of the now-closed `PUT .../status=submitted` loophole, added an
  assertion that a bare status field on `PUT` is now a no-op, added a
  re-approve-is-rejected (422) assertion, and added a new assertion proving
  a `director` (not finance, not a project's PM) can see and approve an
  overhead expense end-to-end.

**Frontend:**
- Removed all dead mock data (`MOCK_CATEGORIES`/`MOCK_VENDORS`/
  `MOCK_EXPENSES`/`MOCK_PROJECTS`) and the unused `localExpenses`/
  `localVendors` state from the Expenses page; every query now defaults to
  `[]` and surfaces a real error banner (`isError` → "Couldn't load expense
  data...") instead of silently looking like "no data yet," matching the
  CRM/Timesheets/Attendance convention.
- Added a `platformSettings.get()` query (same source Quotes/Invoices use)
  and replaced the hardcoded Currency `<select>` (both on the expense form
  and the new vendor currency field) with the real, active currency list;
  both forms default to the platform's default currency instead of a
  guessed id.
- Added the missing Billing Currency field to the vendor create/edit form
  (state, UI, payload, and edit-prefill) — vendor create/update now actually
  succeeds instead of always 422ing.
- "Vendor / Merchant" is no longer marked required on the Log Expense form
  (an ⓘ explains it's fine to leave blank for costs with no specific
  merchant); the placeholder option now reads "No Vendor" instead of a
  disabled-feeling "Select Vendor".
- Approvals Desk: Approve/Reject buttons are now shown per-row only when the
  viewer actually has authority over that expense (`expenses.approve`
  permission, or is that project's manager) — mirroring
  `ExpensePolicy::approve()` exactly. Everyone else sees a plain "Awaiting
  {routing}" label instead of buttons that would 403.
- `handleApproveAction` no longer prompts for a "comment" on Approve (there's
  nowhere for it to go); it now shows a plain confirm dialog. Reject still
  prompts for the real `rejection_reason` field. Both actions now show a
  success toast.
- Expense detail page: replaced role-name guessing
  (`roleNames.includes('finance'|'founder')`) with the user's real
  `permissions` array (`expenses.view_all`, `expenses.approve`) — the same
  fix pattern used for Attendance — so a director's Edit/Approve/Reject/
  Reimburse/Delete buttons now match what the backend will actually
  authorize.
- Projects picker on the Log Expense form now requests `per_page: 200`.
- Added `HelpIcon`s (page title, Vendor field, Approver Routing) and a
  `HowToUseGuide` to both the Expenses list page and the expense detail page
  (`expense_detail` module key).
- Empty states: the Expense Registry now distinguishes "no expenses logged
  yet" (action: Log Expense) from "no expenses match your filters" (action:
  Clear Filters), instead of one generic message with no action either way.
- Removed 5 unused lucide icon imports.

### Remaining issues
- The Expense Breakdown Report (`frontend/src/app/(dashboard)/reports/expenses/page.tsx`)
  builds its CSV export URL as `...&token=${localStorage.getItem('auth_token')}`
  and opens it via `window.open` — the bearer token leaks into the URL/browser
  history. Left untouched: this page belongs to the Reports module (planned
  separately later in this file), and the same CSV-export-via-query-token
  pattern likely needs checking across every report page at once rather than
  fixing it once here.
- No CRUD UI/endpoints exist for `expense_categories` (only the read-only
  `GET /expense-categories` dropdown) — categories are seeded, not
  user-managed. Not a bug; no UI implies otherwise.
- `expenses.create` permission string is defined and granted to `finance`
  but never actually checked (`ExpensePolicy::create()` returns `true` for
  everyone) — this is intentional (any employee must be able to log their
  own expenses) rather than a bug, but the permission string itself is
  effectively vestigial, same conclusion reached for CRM's `lead_tags`.
- No `ExpenseResource`/`VendorResource` API resource layer — both still
  serialize as raw Eloquent models. Consistent with how this module worked
  before; not a behavior-change bug, so left alone.
- Same 2 pre-existing, unrelated test failures noted in every prior module
  (Reports and Settings/Notifications) — untouched.

### Performance improvements
- None needed beyond the existing eager-loading; `index()` already eager-loads
  category/project/vendor/submitter/approver/currency/attachments in one pass.

### UI/UX improvements
- Vendor management actually works now (create/edit no longer always 422s).
- Directors get the full oversight the seeder already intended for them,
  instead of being silently limited to their own expenses.
- Approve/Reject buttons only appear where they'll actually work.
- Logging a vendor-less overhead expense (rent, etc.) is possible again.
- Currency pickers reflect the platform's real, active currency list.
- Onboarding: help icons + "How to Use" guides on both the list and detail
  pages; actionable empty states on the Expense Registry.

### Verification
- `php artisan test` (full suite): 156/158 passing — same 2 pre-existing,
  unrelated failures as every prior module's baseline; targeted
  `Sprint6PayrollExpenseTest`: 5/5 passing (including the new director and
  re-approve-guard assertions). No regressions.
- `php -l` clean on all changed/added backend files.
- `npx tsc --noEmit`: clean across the whole frontend.
- Not manually browser-tested, per the user's explicit instruction — user
  tests every module manually.

### Next recommended module
Payroll — Expenses now correctly separates "who can see every expense" from
"who can act on this one," and reimbursed expenses are a clean, guarded
terminal state; Payroll likely aggregates reimbursed expense data (per
`PayrollExpenseSeeder`'s naming), so it can be audited assuming that upstream
state is now trustworthy.

---

## Module: Payroll

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
Monthly payroll run generation/approval, employee salary/compensation setup,
bonus create/approve/reject, project labor cost allocation, payslip PDF
email/download, and CSV/PDF run export. (`PayrollExpenseSeeder` turned out to
have no actual link between payroll and expenses — see Findings #7 — so no
cross-module reimbursement logic exists to audit here.)

### Findings (root causes, before fixes)
1. **Payroll had no way to onboard a new hire or pay anyone whose salary
   wasn't already seeded directly into the database.** `PayrollRunController::store`
   depends entirely on an `EmployeeCompensation` row existing per employee
   (compensation type, base amount, hourly rate, TDS/PF/ESI %), and on
   `Bonus` rows existing to fold into a run — but **zero routes existed** for
   either model's CRUD. There was no "Salary Setup" page, no bonus-management
   page, and the backend had no `EmployeeCompensationController`/
   `BonusController` at all. In practice this meant payroll could only ever
   be run for the users `PayrollExpenseSeeder` had hardcoded — a real new
   hire's payroll line would silently compute to ₹0, and a real bonus could
   never be created through the app. This is almost certainly the bug this
   audit was commissioned to find, and the most severe gap found in any
   module so far (every prior module's core workflow was at least reachable
   end-to-end; this one wasn't).
2. **`PayrollPolicy::approve` directly contradicted the seeder's explicit,
   documented exclusion.** `RolesPermissionsSeeder` grants `director` every
   permission except `recovery.restore`, `roles.manage`, and — called out by
   name in a comment — `payroll.approve` (a deliberate segregation-of-duty
   carve-out: whoever prepares payroll shouldn't sign off on it). But
   `PayrollPolicy::approve()` checked `hasRole('director')` directly instead
   of the permission string, completely bypassing that exclusion — any
   `director` user could approve any payroll run. `Sprint6PayrollExpenseTest::test_approving_payroll_run`
   explicitly asserted a director's approval returned 200, proving this was
   exercised, working-as-coded behavior, not a dormant bug.
3. **The rest of `PayrollPolicy` (`viewAny`/`view`/`create`/`update`/`delete`)
   used `hasRole('hr') || hasRole('finance')` instead of the `payroll.view`/
   `payroll.manage` permission strings that already existed in the seeder.**
   Unlike Attendance's `hr_manager` bug (a typo'd role that never existed),
   this was a case of the seeder being *correct and deliberately curated* —
   `hr` is never granted any `payroll.*` permission (a comment beside the
   `hr` role's grant list documents exactly what HR does and doesn't get) —
   while the Policy ignored that and gave `hr` full payroll access anyway via
   role-name matching.
4. **`breakdown.deductions`/`breakdown.bonuses` were read by the frontend as
   arrays but never written that way by the backend.** Both the run-detail
   page (`payroll/[id]/page.tsx`) and the dashboard tab view read
   `item.breakdown?.deductions` expecting `[{description, amount}]` to render
   a TDS/PF/ESI sub-breakdown under each row, but `PayrollRunController::store`
   only ever wrote flat keys (`tds`, `pf`, `esi`) into that same JSON column —
   so the sub-breakdown silently never rendered on real data, even though the
   backend was already computing the exact numbers the UI wanted, just under
   different keys.
5. **`ProjectCostAllocation`'s frontend type didn't match the real API
   response at all.** Frontend expected `{allocated_cost, logged_hours,
   percentage}`; the backend (and its own test,
   `Sprint6PayrollExpenseTest::test_project_labor_cost_allocation`) actually
   returns `{total_hours, total_labor_cost, breakdown}` with **no
   `percentage` field whatsoever**. Every cost-allocation row rendered
   `undefined`/`NaN` hours, cost, and percentage bar against the live API.
6. **The cost-allocation tab never passed the selected run's year/month** —
   the backend endpoint accepts `year`/`month` query params (defaulting to
   the current calendar month), but the frontend called it with no params at
   all, so viewing cost allocation for a past payroll run silently showed the
   *current* month's data instead.
7. **The frontend's `isFounder` gate was internally inconsistent with the
   backend it was supposed to mirror**, and used a role name (`'admin'`) that
   has never existed in `RolesPermissionsSeeder`. It also omitted `director`
   (who — before fix #2 — *could* approve payroll server-side, but saw no
   Approve button) and omitted `hr` (who — before fix #3 — had full
   view/create/update/delete access server-side, but saw no "Generate
   Payroll Run" button). It also defaulted to `true` ("Default to true for
   local dev") whenever `user` hadn't loaded yet, briefly flashing
   privileged buttons during load for anyone.
8. **The approve button's "Mark as Paid / Disbburse" label (with a typo)
   implied a `processed`/`paid` transition that has never existed in the
   backend.** `status` only ever moves `draft → approved`; clicking that
   button on an already-approved run just re-ran the same `/approve`
   endpoint (re-setting `approved_by`/`approved_at` and re-sending payslip
   emails) instead of doing anything resembling "marking as paid."
9. Dead code: ~155 lines of `MOCK_RUNS`/`MOCK_RUN_ITEMS`/`MOCK_COST_ALLOCATIONS`
   plus 3 `useState` hooks seeded from them (`localRuns`/`localRunItems`/
   `localCostAllocations`) — never read anywhere outside their own
   declarations. Doubly misleading here because the mock data's shape (e.g.
   `breakdown.deductions` as an array, `allocated_cost`/`percentage` on cost
   allocations) matched what the *frontend* expected, not what the *real
   API* returned — strong evidence the UI was built against the mocks and
   never reconciled against the live backend.
10. All payroll queries (`runs`, `runDetails`, `costAllocations`, `myHistory`)
    silently swallowed fetch failures to empty arrays with no error banner —
    the same "real outage looks identical to no data yet" pattern flagged in
    every prior module. Export/download failures used `showToast(...,
    'info')` instead of `'error'` severity, understating a failed money-related
    PDF/CSV download as merely informational.
11. **Zero onboarding.** None of the four payroll-related pages (dashboard,
    run detail, my-payslips history, and the payroll report) had a
    `HelpIcon` or `HowToUseGuide`.
12. Dead/unreachable model relation: `PayrollRunItem::adjustments()` and the
    entire `PayrollAdjustment` model exist and are fully fleshed out, but
    nothing in the codebase ever creates a `PayrollAdjustment` row — left
    as-is (see "Remaining issues").

### Fixes applied
**Backend:**
- `PayrollPolicy` rewritten to check permission strings instead of role
  names: `viewAny`/`view` → `payroll.view` or `payroll.manage`;
  `create`/`update`/`delete` → `payroll.manage`; `approve` → `payroll.approve`
  only (no `hasRole('director')` bypass). This makes the seeder's existing,
  deliberate grants (finance: view+manage; director: view+manage via the
  "all except" exclusion list, but never approve; nobody but founder holds
  approve) the actual source of truth, closing the director-approval bypass
  and the `hr`-without-permission drift in the same change.
- Added `EmployeeCompensationController` (`index`/`store`/`update`) and
  `EmployeeCompensationPolicy` (gated on `payroll.view`/`payroll.manage`).
  `store` versions compensation the same way the schema already implies:
  creating a new record closes out (`is_current = false`,
  `effective_until` set) whatever was previously current for that employee;
  `update` corrects a record in place without re-versioning, for fixing
  data-entry mistakes. Added a read-only `GET /compensation-types` endpoint
  for the setup form's type dropdown.
- Added `BonusController` (`index`/`store`/`approve`/`reject`) and
  `BonusPolicy` (gated on `payroll.view`/`payroll.manage`; a user can also
  view their own bonuses). `approve`/`reject` guard on the bonus currently
  being `pending` (422 otherwise), mirroring the status-guard pattern already
  used by `ExpenseController`.
- `PayrollRunController::store`'s `breakdown` JSON now includes real
  `deductions: [{description, amount}]` and `bonuses: [{type, amount,
  reason}]` arrays (alongside the existing flat `tds`/`pf`/`esi` keys, kept
  for backward compatibility) — the frontend's breakdown-array expectation
  was actually the more sensible shape; the backend just never produced it.
- Registered `EmployeeCompensationPolicy`/`BonusPolicy` in
  `AppServiceProvider`; added routes for compensation types, employee
  compensations, and bonuses (including `POST bonuses/{bonus}/approve` and
  `/reject`).
- `resources/views/pdf/payslip.blade.php`: now itemizes each approved bonus
  and each deduction line (TDS/PF/ESI) individually instead of only showing
  lump-sum `bonus_amount`/`deductions`, using the same breakdown data now
  computed above (falls back to the lump sums if `breakdown` is empty, e.g.
  for pre-existing rows created before this fix).
- Updated `Sprint6PayrollExpenseTest::test_approving_payroll_run` to assert
  the corrected behavior: employee → 403, director → 403 (no longer 200 —
  the seeder's exclusion is now honored), finance → 403 (holds
  `payroll.manage` but not `payroll.approve`), founder → 200. Added
  `Sprint11PayrollSetupTest` (5 tests): hr can no longer view payroll runs;
  finance can set up and in-place-correct compensation, and a second
  "raise" record correctly closes out the prior current one; a plain
  employee cannot self-grant compensation; the full bonus create → approve
  → reject-when-not-pending workflow; and an approved bonus's reason
  correctly flows into the next payroll run's `breakdown.bonuses`.

**Frontend:**
- `api.ts`: `ProjectCostAllocation`, `PayrollRun`/`PayrollRunItem`/pagination
  return types corrected to match the real API (`total_hours`/
  `total_labor_cost` instead of the fictitious `allocated_cost`/
  `logged_hours`/`percentage`; `LaravelPaginatedResponse` instead of a
  `{data, meta}` envelope that doesn't match how `PayrollRunController`
  actually serializes `paginate()`). Added `employeeCompensationApi`,
  `bonusApi`, and `compensationTypesApi` (typed, matching the new backend
  endpoints), and a `PayrollRunItem.payroll_run` field (the relation
  `myHistory` actually eager-loads but the frontend never had a type for).
- Payroll dashboard (`payroll/page.tsx`): replaced the role-name-guessing
  `isFounder` (`'admin'`, a role that's never existed; missing `director`
  and `hr`) with two real permission checks — `canManagePayroll`
  (`payroll.manage`) and `canApprovePayroll` (`payroll.approve`) — read
  directly from `user.permissions`, matching the same fix pattern used for
  Attendance and Expenses. Removed the "default to true for local dev"
  fallback.
- Added two new top-level views alongside the existing Runs view: **Salary
  Setup** (list of current compensation per employee, with a "Set
  Compensation" modal that creates a new versioned record) and **Bonuses**
  (list with an "Add Bonus" modal, plus per-row Approve/Reject for pending
  bonuses) — without these, "Generate Payroll Run" had nothing real to
  compute from for anyone not already seeded.
- Fixed cost-allocation rendering to use the real `total_hours`/
  `total_labor_cost` fields, compute the allocation percentage client-side
  (the backend never returns one), and pass the selected run's `year`/`month`
  to the endpoint instead of always showing the current calendar month.
- Fixed the deductions/bonus sub-breakdown on both the dashboard and the
  run-detail page to read the now-real `breakdown.deductions`/
  `breakdown.bonuses` arrays (dashboard) and simplified the run-detail
  page's fragile string-matching reduce (`description.includes('tds')`) down
  to directly rendering the same arrays.
- Replaced the "Mark as Paid / Disbburse" mislabeled button (and its typo)
  with: an "Approve Run" button only while `status === 'draft'` and only for
  users with `canApprovePayroll`; once approved, a plain status line
  ("Approved by {name} on {date}") instead of a repeat-clickable button —
  same "replace a repeat-click no-op with a status line" pattern used for
  CRM's Convert-to-Quote button.
- Removed ~155 lines of dead mock data (`MOCK_RUNS`/`MOCK_RUN_ITEMS`/
  `MOCK_COST_ALLOCATIONS`) and the 3 unused local-state fallbacks seeded from
  them.
- Added `isError` handling with visible error banners on every payroll query
  (runs, run details, cost allocation, compensations, bonuses, my-history);
  export/download failure toasts changed from `'info'` to `'error'` severity.
- Added `HelpIcon`s and `HowToUseGuide`s to the payroll dashboard, the run
  detail page, and the my-payslips history page (`payroll`,
  `payroll_run_detail`, `payroll_history` module keys). Left
  `reports/payroll/page.tsx` untouched — it shares `ReportShell` with every
  other report page and has no onboarding slot of its own; bundling that in
  here would mean fixing it once per report page instead of once for the
  Reports module, same reasoning already applied to Expenses' report page.

### Remaining issues
- `PayrollAdjustment`/`PayrollRunItem::adjustments()` remain fully modeled
  but entirely unused — no controller or UI ever creates one. The schema
  clearly anticipated per-item ad-hoc adjustments (a one-off deduction or
  addition outside the standard TDS/PF/ESI/bonus flow); left unbuilt as a
  genuine feature gap rather than a broken promise, since nothing in the UI
  currently implies it works.
- `submitted`/`processed`/`paid` remain valid enum values in the
  `payroll_runs.status` column and in the frontend's TypeScript union, but
  no code path ever transitions to them — `draft → approved` are the only
  two reachable states. Not removed from the type/schema (would touch the
  migration and any historical data), but the UI no longer implies a "mark
  as paid" action exists beyond approval; a future pass could add an
  explicit "mark as disbursed" step if the business tracks bank transfer
  timing separately from approval.
- No UI exposes `EmployeeCompensationController::update` (in-place
  correction) — only the "create a new versioned record" flow is wired to a
  button. The endpoint/policy exist and are tested; adding an inline "fix a
  typo" affordance is a small follow-up if HR/finance asks for it.
- The Expense Breakdown Report's CSV-export-via-query-token pattern flagged
  in the Expenses module also exists on `reports/payroll/page.tsx`
  (`&token=${localStorage.getItem('auth_token')}` in a `window.open` URL) —
  left untouched for the same reason: it's shared across every report page
  and belongs to the Reports module's own audit.
- Same 2 pre-existing, unrelated test failures noted in every prior module
  (Reports and Settings/Notifications) — untouched.

### Performance improvements
- None needed beyond the existing eager-loading in `PayrollRunController`.

### UI/UX improvements
- Payroll can now actually be run for a real new hire or a real bonus,
  instead of being limited to whatever `PayrollExpenseSeeder` hardcoded.
- Director's payroll-approval capability (frontend and backend) now
  correctly matches the seeder's deliberate segregation-of-duty design
  instead of silently bypassing it.
- Cost allocation numbers, percentages, and deduction/bonus sub-breakdowns
  now show real figures instead of blank/`NaN` values.
- Approve button no longer implies a "mark as paid" action that doesn't
  exist; a plain status line replaces it once a run is approved.
- Onboarding: help icons + "How to Use" guides on the payroll dashboard, run
  detail, and payslip history pages; actionable empty states throughout.

### Verification
- `php artisan test` (full suite): 161/163 passing — same 2 pre-existing,
  unrelated failures as every prior module's baseline; targeted payroll
  tests (`Sprint6PayrollExpenseTest`, `Sprint10PayrollFeaturesTest`,
  new `Sprint11PayrollSetupTest`): 15/15 passing. No regressions.
- `php -l` clean on all changed/added backend files, including the updated
  `payslip.blade.php`.
- `php artisan route:list` confirms clean registration of all new
  `employee-compensations`, `bonuses`, and `compensation-types` routes with
  no conflicts against the existing `payroll/*` routes.
- `npx tsc --noEmit`: clean across the whole frontend.
- Not manually browser-tested, per the user's explicit instruction — user
  tests every module manually.

### Next recommended module
Reports — Payroll's run/compensation/bonus data is now correctly shaped and
reachable end-to-end, so the Payroll Summary report (`reports/payroll`,
already flagged above for its token-in-URL export pattern) can be audited
together with every other report page's shared `ReportShell`/export
infrastructure in one pass.

---

## Module: Reports

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
The Reports Hub (`reports/page.tsx`) and its 8 report pages — Revenue
Summary, Sales Pipeline, Quote Conversion, Project Profitability, Team
Utilisation, Expense Breakdown, Payroll Summary, Client 360 Summary — backed
by `ReportController` and its 4 supporting services (`FinancialReportService`,
`LeadReportService`, `ProfitabilityService`, `UtilisationService`). The
`reports/dashboard` endpoint (`ReportController::dashboardOverview`) that
powers the main Dashboard page is explicitly **out of scope** — it's a
separate consumer of this same controller file, planned as its own module
next; see "Remaining issues" for two bugs found in it in passing.

### Findings (root causes, before fixes)
1. **CSV export was broken on all 8 report pages.** Every "Export CSV" button
   built a URL by hand — `` `${apiUrl}/reports/revenue?export=csv&...&token=${localStorage.getItem('auth_token')}` `` —
   and opened it with `window.open()`. The backend's `auth:sanctum` middleware
   only ever authenticates via the `Authorization: Bearer <token>` header;
   nothing anywhere in the app reads a `?token=` query parameter. A plain
   `window.open()` navigation can't set that header, so every export attempt
   hit a 401 page in a new tab instead of downloading a file. This is the same
   pattern already flagged (and deferred to this module) on the Expense
   Breakdown and Payroll Summary report pages during the Expenses and Payroll
   audits — turns out it was universal across all 8 reports, not just those
   two. The correct pattern already existed elsewhere in the app (audit logs'
   CSV export, and every PDF download) — fetch through the authenticated
   axios instance with `responseType: 'blob'`, then trigger the download via
   an object URL — it just was never used here.
2. **Project Manager data leak on Project Profitability.** The query meant to
   scope a PM to only their own managed projects checked
   `!hasAnyPermission(['reports.view_financial', 'reports.view'])` before
   applying the `manager_id` filter — but `RolesPermissionsSeeder` grants
   every `project_manager` `reports.view` (so they can see the Reports nav
   item at all), which made that condition always false. Net effect: **every
   PM saw every project's revenue, labor cost, expenses, and net profit** —
   not just the projects they manage — the opposite of the comment directly
   above the code ("PM is scoped to their own managed projects") and of how
   the sibling Team Utilisation report correctly scopes PMs (which checks
   only `reports.view_hr`, not the near-universal `reports.view`). This is
   almost certainly the bug this module's audit was commissioned to find —
   the same class of "scoping check silently never fires" bug found in
   Expenses (directors silently un-scoped the other way) and Attendance
   (phantom role), just inverted here into an over-exposure instead of a
   lockout.
3. **Project Profitability silently dropped every ongoing project that
   didn't happen to start inside the selected date range.** The report
   filtered projects with `whereBetween('start_date', [$from, $to])` instead
   of "was this project active at any point during the period" — so a
   6-month project that started in January never appeared in the June (or
   any other) profitability report even though its June timesheets and
   expenses are real costs for that period. Every other report in this
   module scopes its entities by *activity* in the period (timesheet dates,
   invoice issue dates, expense dates), not by when the parent record was
   created — Profitability was the one exception.
4. **`test_quote_funnel_calculations` was a pre-existing, silently-broken
   test** (one of the "2 pre-existing, unrelated failures" carried as a
   known baseline since the CRM module's audit). Root cause: `Quote::create([...,
   'created_at' => '2026-06-01', ...])` — `created_at` isn't in `Quote`'s
   `$fillable`, so Eloquent's mass assignment silently drops it and the row
   gets `now()` instead, which falls outside the test's June query range.
   Test-only bug, not a production issue (real quotes always get a real
   timestamp) — but it belonged to this module's audit to fix, and the same
   file's own `Lead` fixtures already show the correct workaround
   (`->created_at = '...'; ->save();`, bypassing mass assignment).
5. **Zero onboarding.** Neither the Reports Hub nor any of the 8 report
   pages had a `HelpIcon` or `HowToUseGuide`, despite the standing rule for
   every module since Projects & Tasks. Report semantics are genuinely
   non-obvious in places (e.g. Client 360's billing figures are date-scoped
   but its project counts are all-time; Payroll Summary scopes by run
   *creation* date, not pay period) with nothing in the UI explaining that.
6. **Client 360's "Total Billed" KPI was mislabeled "Lifetime Billings."**
   The figure is actually scoped to invoices issued within the selected date
   range (same as Total Collected/Outstanding on the same card row) — the
   subtext claimed something the data doesn't show, while "Active Accounts"
   and "Total Clients" on the same row genuinely are all-time and were
   labeled correctly.
7. Project Profitability's "Active Projects" KPI was mislabeled — it counts
   every project whose window overlapped the selected period (finding #3's
   fix), not projects with `status = 'active'`; "Active Projects" implied the
   latter.
8. In passing (not fixed here — belongs to the Dashboard module, see
   "Remaining issues"): `dashboardOverview()` has the same
   start-date-instead-of-overlap project filter as finding #3, and calls
   `$this->gemini->chatWithoutTools(...)` for the AI executive briefing even
   though `ReportController` never injects or defines a `$gemini` property —
   this always throws and is silently swallowed by the surrounding
   `try/catch (\Throwable $e)`, so the "AI" briefing is always the
   hardcoded-template fallback, never an actual model call.

### Fixes applied
**Backend:**
- `ReportController::projectProfitability`: PM-scoping bypass check narrowed
  from `hasAnyPermission(['reports.view_financial', 'reports.view'])` to just
  `hasPermissionTo('reports.view_financial')` — matching the already-correct
  pattern in `teamUtilisation`. A plain PM is now actually limited to their
  own managed projects; finance/founder/director (who hold
  `reports.view_financial`) continue to see everything.
- Same method: project selection changed from `whereBetween('start_date',
  [$from, $to])` to an overlap filter (`start_date <= $to` AND `end_date >=
  $from`, treating null dates as always-in-range) — an ongoing project no
  longer has to have started inside the window to show up.
- Added 2 regression tests to `Sprint8AReportsTest`:
  `test_profitability_report_scopes_pm_to_own_projects` (a PM sees only their
  managed project; a `finance` user sees both) and
  `test_profitability_report_includes_ongoing_projects_started_before_period`
  (a project spanning Jan–Dec still appears in a June-only query).
- Fixed `test_quote_funnel_calculations`: quotes now get their backdated
  `created_at` set post-construction (`new Quote([...]); $quote->created_at =
  '...'; $quote->save();`) instead of via mass assignment, matching the
  pattern the same file already uses for `Lead` fixtures.

**Frontend:**
- Added `reports.exportCsv(endpoint, params)` to `api.ts` — routes through
  the authenticated axios instance with `responseType: 'blob'`, matching the
  existing `auditsApi.exportCsv`/`payrollApi.exportRun` pattern.
- All 8 report pages' `handleExport` rewritten to call `reports.exportCsv(...)`,
  build an object URL from the returned blob, and trigger the download via a
  temporary `<a download>` link — replacing the broken `window.open(...&token=...)`
  call on every page. Export failures now show a real error toast
  (`useToast`) instead of silently opening a 401 page.
- `ReportShell` gained two new optional props — `titleHelp` (a `HelpIcon`
  rendered next to the page title) and `guide` (rendered in the header next
  to the date picker/export button) — so every report page's onboarding
  content can be added without duplicating header layout per page.
- Added a `HelpIcon` (explaining exactly what's measured and how it's scoped)
  and a `HowToUseGuide` (overview + what-it-shows + tips/who-sees-what
  sections) to all 8 report pages and to the Reports Hub itself.
- Fixed Client 360's "Total Billed" KPI subtext from "Lifetime Billings" to
  "Billed in Selected Period."
- Renamed Project Profitability's "Active Projects" KPI to "Projects in
  Scope" / "Active During Period" to match what `project_count` actually
  measures after the overlap-filter fix.

### Remaining issues
- `reports.export` permission string is defined and granted (finance,
  founder, director) but never actually checked anywhere in
  `ReportController` — every CSV export gate is identical to that report's
  view gate. Same "vestigial permission" conclusion already reached for
  `expenses.create` and CRM's `lead_tags` — not a behavior-change bug, left
  alone rather than introducing a new access tier nobody asked for.
- `department_head` holds `reports.view` (so the "Reports" nav item appears
  for them) but none of `reports.view_financial`/`view_hr`/`view_sales` and
  isn't `project_manager` — every one of the 8 report cards renders locked
  for them on the Hub page. Nothing is actually broken (the Hub's lock
  icons work exactly as designed), but it's a nav item that currently leads
  nowhere useful for that role; left as a flagged product question rather
  than unilaterally granting department heads a new report permission.
- Payroll Summary scopes "in period" by `payroll_runs.created_at`, not by the
  run's `year`/`month` pay period — a run created late (after month-end)
  shows up under the creation date's range, not the period it actually
  covers. Documented in the report's new HelpIcon rather than changed, since
  switching the scoping column is a real behavior change with no clear
  signal on which semantics finance actually wants.
- Two bugs found in passing in `dashboardOverview()` (not part of this
  module's scope — that endpoint serves the Dashboard page, audited next):
  (1) the same start-date-instead-of-overlap project filter as this module's
  finding #3, used for the "this month profitability" and "most profitable
  project" dashboard widgets; (2) `$this->gemini` is referenced but never
  defined/injected on `ReportController`, so the AI executive briefing always
  silently falls through to its hardcoded-template fallback instead of ever
  calling a model. Flagged here for whoever picks up the Dashboard module.
- Same 1 pre-existing, unrelated test failure noted in every prior module
  (`Sprint9NotificationTest::test_welcome_email_sent_on_user_creation`,
  Settings/Notifications) — untouched. The other previously-known failure
  (`Sprint8AReportsTest::test_quote_funnel_calculations`) is fixed as part of
  this module (finding #4).

### Performance improvements
- None needed — every report endpoint already batches its DB queries
  (grouped/keyed collections fetched once, not per-row) and is wrapped in a
  60-second cache; no N+1s found.

### UI/UX improvements
- CSV export actually downloads a file on every report now, instead of
  opening a 401 error page.
- A Project Manager's Profitability report now only ever shows their own
  projects' real numbers — no more accidental exposure of every other
  project's revenue and cost figures.
- Ongoing multi-month projects no longer vanish from Profitability reports
  for every period except the one containing their start date.
- Onboarding: `HelpIcon`s + `HowToUseGuide`s on the Reports Hub and all 8
  report pages, each explaining exactly what's measured and how it's scoped
  to the date range — the first module where every page also documents its
  own date-scoping quirks (e.g. Client 360's project counts being all-time
  while its billing figures are period-scoped) directly in the UI.
- Two misleading KPI labels corrected (Client 360's "Lifetime Billings",
  Profitability's "Active Projects").

### Verification
- `php artisan test` (full suite): 164/165 passing — the 1 remaining failure
  is the pre-existing, unrelated Settings/Notifications test-mailable bug;
  targeted `Sprint8AReportsTest`: 11/11 passing (9 pre-existing + 1 fixed +
  2 new regression tests), up from 8/9 passing at the start of this module.
- `php -l` clean on `ReportController.php` and the updated test file.
- `npx tsc --noEmit`: clean across the whole frontend.
- `npx next build`: production build succeeds, all 8 report routes plus the
  Reports Hub compile and prerender cleanly.
- Not manually browser-tested, per the user's explicit instruction — user
  tests every module manually.

### Next recommended module
Dashboard — the last module, since it depends on every other module's data
being correct. Its `reports/dashboard` endpoint shares `ReportController`
with the module just audited here and already has two known bugs waiting
(see "Remaining issues" above): the same project date-overlap issue fixed in
Profitability, and a broken `$this->gemini` reference that silently disables
the AI executive briefing.

---

## Module: Settings & Notifications

**Status:** ✅ production-ready (completed 2026-07-10)

Audited out of order, ahead of Dashboard/Clients/Services/Users/Roles &
Permissions, by explicit user request.

### Scope
Company/General Settings (profile, tax, currencies), Mail/SMTP configuration
+ test email, Number Sequences, Notification Preferences, CRM Pipelines &
Sources (`/settings/crm`), Audit Logs, Backups & Recovery (database backups
+ the previously unreachable Recovery Bin), Danger Zone (platform/module/
factory reset), My Profile + Login Session History, Change Password. Backed
by `SettingController`, `NotificationPreferenceController`, `AuditLogController`,
`BackupController`, `SystemResetController`, `RecoveryController`,
`LeadStageController`/`LeadSourceController`, and `AuthController`'s
profile/password/login-activity endpoints. There is no dedicated "AI
Assistant settings" page — AI configuration (`GEMINI_API_KEY`/model) is
env-var only with no DB-backed settings or admin UI anywhere in the app;
noted under "Remaining issues" as a product question rather than a bug.

### Findings (root causes, before fixes)
1. **The phantom-role bug named in this audit's brief.** `AuditLogController::index()`
   gated the entire Audit Logs feature (list + CSV export) on
   `hasAnyRole(['founder', 'director', 'hr_manager'])` — `hr_manager` has
   never been a seeded role (the exact same phantom-role class of bug already
   found and fixed in the Attendance and Payroll modules). Functionally this
   didn't lock anyone out beyond intent (only founder/director were ever
   meant to see this page, and both role names in the check were real), but
   it left the feature on ad-hoc role-name matching instead of the
   permission system every other module has since been converted to, and a
   real `audit.view` permission already existed in the seeder — granted to
   founder/director automatically — but was never actually read anywhere.
2. **Audit Logs' "Module Section" filter was completely broken.** The
   frontend sent `module=App\Models\Project`, but
   `AuditLogController::index()` only ever reads `auditable_type` from the
   request — the module dropdown silently filtered nothing, on every one of
   its 9 options, for as long as this page has existed.
3. **Saved notification preferences never displayed as saved.** The exact
   "res.data vs res.data.data" bug class already found and fixed in the
   Timesheets module recurred here, unfixed until now: `GET
   /settings/notifications` returns `{data: [...]}` with no pagination
   `meta`, so the global axios interceptor unwraps it to a bare array — but
   the Notification Settings page declared `useQuery<{data:
   PreferenceItem[]}>` and read `serverPrefs.data`, which is `undefined` on
   an array. The load-into-form effect's `Array.isArray(serverPrefs.data)`
   guard was therefore always `false`, so every saved preference was
   silently discarded on every page load — the form always reset to its
   hardcoded defaults, even immediately after a successful save + reload.
4. **Two of the Notification Settings page's three columns did nothing, in
   either direction, for every single event.** `in_app` and `push` are
   collected, validated, and persisted by `NotificationPreferenceController`,
   but **grepping the entire backend confirms neither is ever read back
   anywhere** — every in-app alert (`Alert::create(...)` in `LeadObserver`/
   `QuoteObserver`/`AiAutomationObserver`) fires unconditionally regardless
   of the `in_app` preference, and no push-notification transport (FCM,
   web-push, or otherwise) exists anywhere in the codebase, so `push` was
   pure decoration. Only `email` is ever consulted, and only for 3 of the
   page's 6 listed events (`task_assigned`, `timesheet_submitted`,
   `payroll_processed` — checked in `TaskController`/`TimesheetController`/
   `PayrollRunController` respectively). The other 3 listed events
   (`lead_assigned`, `invoice_overdue`, `payment_received`) have **zero**
   wiring on **any** channel: `lead_assigned` fires an in-app alert
   unconditionally but no email code path for it exists at all, and
   `invoice_overdue`/`payment_received` have no alert or email logic
   anywhere under those names — toggling any of their 6 checkboxes was a
   complete no-op in every direction. Net effect: of the 18 checkboxes the
   page presented, only 3 (the Email column for Task Assignment, Timesheet
   Submissions, and Payslip Availability) ever did anything.
5. **`recovery.restore` — a permission the seeder deliberately and by-name
   excludes from `director`** ("director: all EXCEPT recovery.restore,
   roles.manage, payroll.approve") **was never checked by any code path.**
   `BackupController::destroy()`/`restore()` and the `access-recovery-bin`/
   `restore-deleted` Gates (`AppServiceProvider`) all hardcoded
   `hasRole('founder')` directly — the exact same "ad-hoc role check instead
   of the permission layer" class of bug already fixed in every prior
   module, except here it meant a permission the seeder's own comments treat
   as meaningful had silently never been wired to anything.
6. **A real, live frontend/backend authorization mismatch on the Backups
   page**, of the same class already found in Attendance/Payroll: the
   Settings nav shows "Backups & Recovery" to any `isAdmin` user (founder OR
   director), but `BackupController`'s `index`/`store`/`destroy`/`restore`
   were **all** `hasRole('founder')`-only — a director could open the page
   from their own nav and have the very first `GET /backups` call 403.
7. **The Backups page's `MOCK_BACKUPS` fallback made the above bug invisible.**
   `backupsApi.list()`'s `catch` block returned 3 fabricated backup rows
   (with a fake "corrupted" one) indistinguishable from real data —
   precisely the "an outage/403 looks identical to real data" masking
   pattern flagged and removed in every prior module, compounded here by the
   fact that a director hitting this exact fallback would see fake backup
   files with working-looking Restore/Delete buttons that would then 403 or
   404 against the real API. The same masking pattern was also present on
   General Settings (`MOCK_SETTINGS`), Number Sequences (`MOCK_SEQUENCES`),
   Audit Logs (`MOCK_AUDIT_LOGS`), and CRM Pipelines & Sources
   (`MOCK_LEAD_STAGES`/`MOCK_LEAD_SOURCES`).
8. **`RecoveryController` — a fully built, policy-gated, working "Recovery
   Bin" feature for restoring individually soft-deleted records — had zero
   frontend UI anywhere in the app.** `GET /recovery-bin` and `POST
   /recovery-bin/{id}/restore` existed, were correctly gated on
   `Gate::authorize('access-recovery-bin')`, and are exercised by
   `DeletedRecord`-producing code elsewhere, but no page, tab, or button in
   the entire frontend ever called them — the same "real backend, zero UI"
   flagship-bug class as Payroll's missing Salary Setup/Bonuses pages.
9. **`AppServiceProvider` defined a `restore-deleted` Gate that nothing ever
   called** (`access-recovery-bin` is the one `RecoveryController` actually
   uses for both listing and restoring) — dead code, same class as every
   prior module's leftover dead branches/mocks.
10. **The `payment` number-sequence entity type was never seeded.**
    `Payment`'s model boot calls `NumberSequence::generateNext('payment')` on
    every recorded payment (real, wired code), but `NumberSequenceSeeder`
    only seeds `lead`/`quote`/`invoice`/`project`/`task`/`expense`/`payroll`.
    `generateNext()`'s fallback path would have silently auto-created a
    `payment` sequence on first use with a **derived prefix of `PAY`** —
    cosmetically colliding with payroll's own `PAY` prefix (a payroll run
    number and a payment receipt number could render as identical-looking
    codes) — and that row would stay invisible on the Number Sequences
    settings page until the first payment was ever recorded.
11. **CRM Pipelines & Sources' 6 mutations (create/update/delete stage,
    create/update/delete source) had no `onError` handlers at all** — unlike
    every other Settings page, a failed save/delete here vanished completely
    silently, with no toast, no banner, nothing telling the user it didn't
    work.
12. Audit Logs' CSV export failure toast used `'info'` severity
    ("CSV Export failed or bypassed (offline)") instead of `'error'` — same
    understated-failure-severity issue already fixed on Payroll/Reports'
    export failures.
13. **Zero onboarding.** None of the 10 Settings pages had a `HelpIcon` or
    `HowToUseGuide`, despite the standing rule for every module since
    Projects & Tasks — and several of this module's pages (Notification
    Preferences' real vs. decorative channels, Danger Zone's three
    escalating levels of destructiveness, Number Sequences' placeholder
    syntax) are exactly the kind of non-obvious semantics that rule exists
    to cover.

### Fixes applied
**Backend:**
- `AuditLogController::index()`: `hasAnyRole([...'hr_manager'])` replaced
  with `hasPermissionTo('audit.view')` — identical effective access today
  (founder + director only), now sourced from the permission system instead
  of a hardcoded, partly-phantom role list.
- `BackupController`: `index`/`store` now check `hasPermissionTo('settings.manage')`
  (founder + director — matches the nav's `isAdmin` visibility exactly, and
  the same permission `LeadStageController`/`LeadSourceController` already
  use for CRM configuration); `destroy`/`restore` now check
  `hasPermissionTo('recovery.restore')` (founder only, matching the seeder's
  deliberate exclusion of director) instead of `hasRole('founder')` directly.
- `AppServiceProvider`: `access-recovery-bin` Gate now checks
  `hasPermissionTo('recovery.restore')` instead of `hasRole('founder')`
  (same effective result today, now permission-driven); removed the dead,
  never-called `restore-deleted` Gate.
- `NotificationPreferenceController::update()`: `in_app`/`push` changed from
  `required` to `sometimes` in validation (defaulting to `true`/`false`),
  since neither is read by any consumer and the frontend no longer collects
  them — the DB columns are left in place (harmless, matches this project's
  established "vestigial permission/field, leave alone" precedent) rather
  than a schema migration to drop them.
- `NumberSequenceSeeder`: added the missing `payment` entity type
  (prefix `RCPT`, distinct from payroll's `PAY`) and re-ran it locally
  (additive `upsert`, no data loss).
- Fixed `Sprint9NotificationTest::test_welcome_email_sent_on_user_creation`
  (the "remaining known failing Settings/Notifications backend test" named
  in this audit's brief): `WelcomeUserMail` is dispatched via `->queue()`
  (`UserController::store`), so it lands in `Mail::fake()`'s queued
  mailables, not sent ones — swapped `Mail::assertSent` for
  `Mail::assertQueued`, per this file's own prior note calling it a test bug.
- Removed a leftover `$response->dump()` debug statement from
  `Sprint8BPlatformTest::test_backups_lifecycle`.
- Added `Sprint8BPlatformTest::test_backups_authorization_by_role` (director
  can view/create backups but gets 403 on delete/restore; employee gets 403
  on everything) and `test_audit_logs_authorization_by_role` (director
  allowed, hr and employee both 403) — regression coverage for findings #1
  and #5/#6.

**Frontend:**
- `api.ts`: fixed `AuditLogParams.module` → `auditable_type` (matching what
  the backend actually reads); added `recoveryApi` (`list`/`restore`) and a
  `DeletedRecord` type for the new Recovery Bin UI; simplified
  `notificationPreferences` to the real, working shape
  (`{event_type, email}[]` in and out — see below).
- **Notification Settings page rewritten**: now lists only the 3 events
  that actually deliver an email (Task Assignment, Timesheet Submissions,
  Payslip Availability) with a single working Email toggle each — the
  In-App and Push columns and the 3 fully-unwired events (Lead Assignment,
  Invoice Overdue, Payment Received) were removed rather than left as
  checkboxes that silently do nothing, consistent with this project's
  standing practice of removing non-functional controls instead of shipping
  them broken. Fixed the `res.data`/`res.data.data` load bug so saved
  preferences now actually populate the form on reload. Added a `HelpIcon`
  + `HowToUseGuide` explaining plainly that in-app alerts for other activity
  are always on and can't be toggled here today.
- **Backups & Recovery page**: removed the `MOCK_BACKUPS` fallback (real
  error banner instead); added a **Recovery Bin tab** — the first UI ever
  built for `RecoveryController`'s list/restore endpoints — showing deleted
  records with type, deleted-by, reason, and a one-click Restore action.
  Added `HelpIcon` + `HowToUseGuide` covering both halves of the page and
  who can do what.
- **Audit Logs page**: fixed the Module Section filter to send
  `auditable_type` (now actually filters); removed the `MOCK_AUDIT_LOGS`
  fallback (real error banner instead); CSV export failure toast changed
  from `'info'` to `'error'`; added `HelpIcon` + `HowToUseGuide`.
- **General Settings, Number Sequences, CRM Pipelines & Sources**: removed
  `MOCK_SETTINGS`/`MOCK_SEQUENCES`/`MOCK_LEAD_STAGES`/`MOCK_LEAD_SOURCES`
  fallbacks (real error banners instead); CRM page's 6 mutations
  (stage/source create/update/delete) gained real success/error toasts
  where there were previously none at all; added `HelpIcon`s +
  `HowToUseGuide`s to both pages.
- **Mail/SMTP Settings, Danger Zone, My Profile, Change Password**: added
  `HelpIcon`s + `HowToUseGuide`s (all four had zero onboarding before this
  pass); Profile's Login Session History gained a real error banner (was
  silently blank on fetch failure) and a `HelpIcon` explaining what it is;
  Change Password's guide explicitly calls out that changing your password
  signs out every other device (backend already revokes all tokens and
  issues one fresh one — this was previously undocumented in the UI).

### Remaining issues
- **In-app alerts and email for `lead_assigned`, `invoice_overdue`, and
  `payment_received` remain unbuilt.** Wiring `in_app` gating into
  `LeadObserver`'s alert creation, and building any notification at all for
  invoice-overdue/payment-received, would mean touching CRM's/Invoicing's
  own files — out of scope for this pass per this project's
  don't-expand-into-other-modules rule. Flagged here as a genuine future
  feature (not a broken promise, now that the UI no longer implies it
  works) for whoever next touches CRM or Invoicing notifications.
- **No push-notification transport exists anywhere** (no FCM/web-push
  integration) — same reasoning; a real "push" channel is new infrastructure,
  not a fix, and was removed from the UI rather than built here.
- **No dedicated "AI Assistant settings" page exists**, and none was added —
  AI configuration (`GEMINI_API_KEY`/model/enabled flag) is env-var only via
  `config('services.gemini.*')`, with no DB-backed settings table or admin
  UI anywhere in the app. This is a product question (does the business want
  runtime-configurable AI settings without a server redeploy?) rather than a
  bug; flagged for whoever picks up the AI Assistant module.
- `settings.view`/`settings.manage` and the Backups permissions above are
  now permission-driven, but `SettingController::authorizeSettings()` itself
  still uses `hasAnyRole(['founder', 'director'])` rather than
  `hasPermissionTo('settings.manage')` — functionally identical today (only
  those two roles hold it) and matches this exact file's own pre-existing
  style, so left as-is rather than an unrelated style-only diff.
- Payroll Summary's report-page-level CSV export token-in-URL pattern
  (flagged in the Expenses/Payroll/Reports modules) does not apply to this
  module — Audit Logs' CSV export already correctly uses the authenticated
  blob-download pattern, and was confirmed still correct here.
- No `AttendanceRecord`-style API resource layer exists for `BackupFile`/
  `DeletedRecord`/audit log rows (raw arrays/models), consistent with how
  this area of the app already worked; not a behavior-change bug.

### Performance improvements
- None needed — Settings/Audit/Backup queries are all small, unpaginated-by-
  design lookups or already-paginated list endpoints with existing eager
  loads (`AuditLogController` already eager-loads `user:id,name,email`).

### UI/UX improvements
- Notification Preferences now shows exactly what it can deliver (3 events,
  Email only) instead of 18 checkboxes where 15 silently did nothing — and
  saved choices now actually persist across a page reload.
- Audit Logs' Module filter and CSV export severity now work/read correctly.
- Backups & Recovery gained a working Recovery Bin (previously unreachable
  by anyone), and a director can now actually view/create backups from the
  page their own nav already promised them.
- Onboarding: `HelpIcon`s + `HowToUseGuide`s added to all 10 Settings pages
  — the first module where every single page in the module got this pass in
  one go, including the three highest-stakes pages (Danger Zone, Backups &
  Recovery, Change Password) that most needed the "what exactly will this do
  to me" context.

### Verification
- `php artisan test` (full suite): **167/167 passing** — the previously
  failing `Sprint9NotificationTest::test_welcome_email_sent_on_user_creation`
  (the last known pre-existing failure carried since the CRM module) is now
  fixed, plus 2 new regression tests added this module; no regressions
  anywhere else. Targeted `Sprint8BPlatformTest`: 11/11 passing.
- `php -l` clean on all changed/added backend files.
- `npx tsc --noEmit`: clean across the whole frontend.
- `npx next build`: production build succeeds; all 10 Settings routes
  compile and prerender cleanly.
- Re-ran `NumberSequenceSeeder` against the local dev database to apply the
  new `payment` entity type (additive `upsert` — no data loss); verified via
  Tinker that `number_sequences` now has a `payment` row with prefix `RCPT`.
- Not manually browser-tested — per this session's explicit instruction, the
  user tests every page of this module manually.

### Next recommended module
Per the user's explicit instruction, this module is complete and the
session stops here for manual testing — **not** auto-continuing to Dashboard
or any other module.

---

## Production Readiness Audit (application-wide)

**Status:** ✅ complete (2026-07-10)

Per the user's explicit instruction, this pass does **not** re-audit any
already-completed module (CRM/Leads, Quotes & Invoicing, Projects & Tasks,
Timesheets, Attendance, Expenses, Payroll, Reports, Settings & Notifications)
and does **not** perform a full feature audit of the modules still pending
their own turn (Dashboard, Clients, Services, Users, Roles & Permissions, AI
Assistant, Client Portal). It looks only at application-wide/cross-cutting
concerns: navigation, RBAC consistency, API contracts, dead code, missing UI
states, performance/indexes/security, and build/config health — using 7
parallel research passes followed by verified fixes. `php artisan test`,
`php -l`, and `npx tsc --noEmit` were used throughout, per this project's
standing "no browser verification" rule; `npx next build` was also run as a
final production-build check.

### Findings & fixes — Security (most severe)

1. **CRITICAL — Privilege escalation: any authenticated user could grant
   themselves (or anyone) the founder role.** `UserPolicy::update()` lets a
   user update their own record unconditionally (`$authUser->id ===
   $user->id`) — a deliberate, correct bypass for self-service profile edits
   (name/phone/etc.). But `UserController::update()`/`syncRoles()` reused
   that same `authorize('update', $user)` check for `role_ids`/
   `department_ids` too, with no separate check — so a plain `employee`
   could `PUT /users/{own_id}/roles` with the founder role's id and become a
   founder, bypassing `users.edit`/`roles.manage` entirely. Separately, even
   a legitimate `users.edit` holder (director, hr — both hold it per the
   seeder) could grant the founder role to any user, including themself,
   which is equivalent to full admin since every Policy's `before()` hook
   makes founder an unconditional bypass.
   **Fixed:** `UserController` (`update`, `store`, `syncRoles`,
   `syncDepartments`) now always requires `users.edit`/`users.create`
   explicitly for role/department changes (the self-bypass no longer
   extends to them), and a new `assertCanAssignRoles()` guard blocks
   granting the `founder` role to anyone unless the actor is already a
   founder. Added `Sprint12ProductionReadinessTest` (6 tests) covering the
   lockout, the director-can't-self-escalate case, and confirming ordinary
   role reassignment and self-profile edits still work.
2. **HIGH — Path traversal / arbitrary file delete via attachments.**
   `TaskAttachmentController::store()` and `ProjectDocumentController::store()`
   accepted a client-supplied `file_path` string with no verification it
   came from the real `POST /files/upload` flow and no traversal check;
   `destroy()` then called `Storage::disk('public')->delete($file_path)`
   using that same unchecked string — a user with attachment access on any
   task/project they can reach could point `file_path` at an unrelated
   file elsewhere on the public disk and delete it.
   **Fixed:** both controllers now validate `file_path` against
   `^uploads/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$` (confines it to the uploads
   tree, blocks `../` traversal) and require the path to actually exist on
   disk before accepting it. Updated `Sprint10FileUploadTest` (which
   previously posted a `file_path` that was never actually stored) to
   create the fake file first; added 2 new regression tests.
3. **HIGH — Roles & Permissions page ran on a fictitious permission
   catalog, disconnected from the real backend.** The entire permission
   matrix (`frontend/src/app/(dashboard)/roles/page.tsx`) was hardcoded
   (`PERMISSION_MODULES`, `PERM_NAME_TO_ID`) with invented permission names
   (`crm.view`, `hr.manage`, `tasks.assign`, etc.) that don't exist in
   `RolesPermissionsSeeder` — entire real permission groups (`leads.*`,
   `departments.*`, `attendance.*`, `leave.*`, `holidays.manage`,
   `audit.view`, `recovery.restore`) had no checkbox at all, so an admin
   could never grant them through this page. Worse, `GET /permissions`
   actually returns permissions **grouped by module** (`{users: [...],
   clients: [...], ...}`), not a flat array — the frontend's
   `Array.isArray(payload) ? payload : payload?.data ?? []` unwrap always
   fell through to `[]` on this object shape, so `permissionsData` was
   always empty and every real save silently fell back to the fictitious
   `PERM_NAME_TO_ID` map, sending IDs that don't correspond to real
   permissions. `SYSTEM_ROLES` also referenced a phantom `admin` role that
   was never seeded, while the real `director` role had no such protection.
   **Fixed:** rewrote the page to consume the real grouped `/permissions`
   response directly (module labels/permission labels derived from the real
   `module.action` names, with a small display-label map), removed all
   fictitious permission/role data, and fixed the protected-role check to
   the one real system role (`founder`). Also fixed
   `RoleController::syncPermissions()`, which — unlike `update()`/
   `destroy()` — had no guard against modifying the founder role's
   permission set; added the same guard, plus 2 new regression tests
   (grouped-object shape assertion, founder-permissions-can't-be-synced).
4. **MEDIUM — Client Portal data endpoints didn't actually check the
   `client` role.** `routes/api.php` documents the portal group as "client
   role enforced inside controller," but only `login()` ever checked
   `hasRole('client')` — `projects()`, `projectShow()`, `projectTasks()`,
   and `invoices()` relied solely on ownership scoping (`client_id ===
   user->id`). No real cross-tenant leak existed (a staff user's id never
   matches a real client's), but any authenticated staff Sanctum token
   could legally hit these "portal" routes. **Fixed:** added an explicit
   `assertIsPortalClient()` check (mirroring `login()`'s) to all four data
   endpoints. Updated `Sprint7ProfitabilityPortalTest`'s
   `test_staff_user_can_access_portal_endpoints_if_authenticated_via_sanctum`
   (which had asserted the gap as intended behavior) to assert 403 instead.

### Findings & fixes — Broken features / silent failures

5. **Portal project detail's Milestones tab was permanently empty, and
   portal list "total" counts never showed.** `portalApi`'s axios response
   interceptor (`frontend/src/lib/api.ts`) unconditionally collapsed
   `response.data.data` → `response.data` with no exception for sibling
   keys — but `PortalController::projectShow` returns `{data, milestones}`
   and paginated endpoints return `{data, meta, links}`. The interceptor
   discarded `milestones`/`meta` every time, even though the page already
   had defensive code (added in an earlier module pass) expecting them to
   sometimes survive. **Fixed:** the interceptor now only collapses to the
   bare resource when `data` is the sole (or only-with-`message`) key,
   preserving `milestones`/`meta`/`links` — no frontend page changes were
   needed since the defensive branches were already correct and simply
   never used to fire. Also fixed `portal.login` to use the `portalApi`
   axios instance instead of the staff `api` instance (cosmetic today, but
   the wrong instance for a portal-specific call).
6. **Users detail page showed "User not found" for every real employee.**
   `usersApi.show()`'s response is already unwrapped by the global
   interceptor, so `res.data` is the flat `User` — but the page read
   `res.data.data`, which is always `undefined`. Same bug independently
   broke the Compensation tab's save (see #7) and the Clients page's Edit
   Client modal role dropdown (always blank, same `res.data.data` pattern).
   **Fixed** in `users/[id]/page.tsx` and `clients/page.tsx`.
7. **Compensation tab silently discarded every save.** It sent
   `tds_percent`/`pf_percent`/`esi_percent` via `usersApi.update()`, but
   `UserController::update()`'s validation whitelist has no such keys —
   Laravel drops them, the request returns 200, and a "Compensation
   updated successfully!" toast fired regardless of whether anything
   persisted. **Fixed:** rewired to the real `employeeCompensationApi`
   (built during the Payroll module) which actually persists these fields;
   the form now also fetches and prefills the employee's current
   compensation record, and is disabled with a clear message when none
   exists yet.
8. **Services page mutations reported success on failure.** Both the
   service and package create/update modals had `onError: () =>
   onSuccess()` — any real validation/500 error closed the modal and
   invalidated the query exactly as if the save had worked, with no error
   shown. Delete failures were silently dismissed the same way. **Fixed:**
   all four now show a real error toast and leave the modal open on
   failure.
9. **AI Assistant swallowed chat and upload failures.** A failed chat
   request just made the optimistic message bubble vanish with no
   indication anything went wrong; a failed file upload only logged to the
   browser console. **Fixed:** both now show an error toast.
10. **AI Automations delete had zero confirmation dialog** — the trash icon
    fired the delete mutation directly. **Fixed:** now routed through the
    same `ConfirmModal` used elsewhere in the app.
11. **Dashboard, Clients (roles/report queries), and Services (all three
    catalog queries) silently swallowed fetch failures**, rendering as
    "no data" indistinguishable from a real outage — the same masking
    pattern already fixed in every previously-audited module. **Fixed:**
    added `isError` tracking and visible error banners to all of them.

### Findings & fixes — Navigation

12. **Command palette (Ctrl+K) bypassed the sidebar's own permission and
    AI-feature-flag gating** — it searched/navigated an unfiltered item
    list, so a user could jump to pages (including Users, Roles, AI
    Assistant when disabled) their sidebar correctly hides. **Fixed:** the
    palette now uses the same filtered list the sidebar renders.
13. **Topbar "AI" shortcut button ignored the `NEXT_PUBLIC_AI_ENABLED`
    flag** the sidebar already respects. **Fixed:** gated identically.
14. **`/departments` had a fully working CRUD page with zero nav entry** —
    reachable only by typing the URL. **Fixed:** added to the sidebar,
    gated on `departments.view` (the real permission already defined in
    the seeder).
15. **`/users/{id}` and `/payroll/{id}` were orphaned pages** with real,
    distinct functionality (Profile/Compensation tabs; CSV/PDF export)
    unreachable from their respective list pages. **Fixed:** added explicit
    links from both list pages without removing the existing modal/inline
    views.
16. **`/ai/automations` had no link from the AI Assistant page.** **Fixed:**
    added a "Manage Automations" link in the chat header.
17. **Quote detail never linked back to the originating Lead.** **Fixed:**
    added a link when `lead_id`/`lead.id` is present in the payload.

### Findings & fixes — Dead code

18. Removed unused `MOCK_CLIENTS`, `MOCK_CATEGORIES`/`MOCK_SERVICES`/
    `MOCK_PACKAGES`, and `MOCK_ALERTS` (the last was a live fallback in
    `AlertsDrawer` masking real notification-fetch failures behind
    fabricated invoice/client data — replaced with a real error state).
    The Roles & Permissions rewrite (#3) also eliminated `MOCK_ROLES` and
    the entire fictitious permission catalog as a side effect.
19. Deleted two fully-unreferenced duplicate components:
    `components/layout/CommandPalette.tsx` (superseded by the inline
    `CommandPaletteV2` in `AppShell.tsx`) and `components/ui/DateRangePicker.tsx`
    (superseded by `components/reports/DateRangePicker.tsx`, the one
    `ReportShell` actually uses).
20. Consolidated 7 report pages' duplicate `Intl.NumberFormat` currency
    formatting (`reports/{clients,expenses,payroll,pipeline,profitability,
    quotes,revenue}/page.tsx`) to the shared `formatCurrency` from
    `lib/utils.ts` — verified byte-identical output first, so no visible
    change, just one fewer place to drift out of sync.

### Findings & fixes — Performance

21. **N+1 queries in `PayrollRunController::store()`** — the active-employee
    query had no eager-load, so `$employee->compensation` and
    `$comp->compensationType` lazy-loaded once per employee inside the run
    loop. **Fixed:** added `->with('compensation.compensationType')`. (The
    separate per-employee `Timesheet::sum()`/`Bonus::get()` queries and the
    per-item write loop are a larger restructuring, left as-is.)
22. **`AiController::listConversations()` never returned a message preview**
    — the frontend's sidebar preview (`conv.messages?.[0]?.content`) was
    always `undefined` since messages weren't eager-loaded. **Fixed:** added
    `->with(['messages' => fn($q) => $q->latest()->limit(1)])`.
23. **Missing indexes** on `expenses.expense_date`, `expenses.status`
    (both heavily filtered by `FinancialReportService` and the dashboard),
    and `bonuses.effective_date` (filtered by `whereYear`/`whereMonth`/
    `whereBetween` in payroll generation and reporting). **Fixed:** new
    additive migration, applied locally with no data loss.

### Findings & fixes — Production config

24. **A production build with `NEXT_PUBLIC_API_URL` unset silently bakes in
    `http://localhost:8000/api/v1`** — Next.js inlines `NEXT_PUBLIC_*` vars
    at build time, so this fails with no build error, only broken API
    calls in the browser. **Fixed:** added a runtime `console.warn` in
    production when the var is missing, so a misconfigured deploy is at
    least visible.
25. **`backend/.env.example` didn't document Reverb (websocket) or Gemini
    AI env vars** actually read by `config/reverb.php`/`config/services.php`,
    and had no warning near `APP_DEBUG=true`/`APP_ENV=local` about changing
    them for a real deployment. **Fixed:** added all of them with
    explanatory comments (no existing values changed).

### Remaining issues (flagged, not fixed — judgment calls on scope)

- **Package `discount_type`/`discount_value` don't actually persist** —
  `PackageController` only ever stores the final `price`; the frontend
  recomputes a fake `discount_type: 'fixed'` on every reload, so a package
  created with a percentage discount silently redisplays as "Fixed Price."
  Real bug, but fixing it means either adding backend columns or reworking
  the package form's model — left for a future Services module pass.
- **Clients module has no per-client detail page/URL** (client detail is
  modal-only), so Projects/Invoices/Leads that reference a client can only
  show its name as plain text with no way to click through. A genuine
  cross-module gap, but building a Clients detail route is Clients-module
  work, not a navigation fix — left for that module's own audit (next in
  the planned order).
- **HelpIcon/HowToUseGuide coverage for Dashboard, Clients, Services,
  Users, AI Assistant, and Client Portal** is still largely absent (Roles
  & Permissions gained full onboarding as part of its rewrite in this
  pass). Writing genuine per-module onboarding content for pages that
  haven't had their own audit yet is exactly the kind of module-content
  work this pass was scoped to defer — left for each module's own turn.
  **✅ Resolved 2026-07-10** by the dedicated Onboarding Coverage Pass
  (see the final section of this file) — every user-facing page now has
  both components.
- **Several backend routes are unreachable from the frontend** —
  `AuthController::logoutAll`, `CreditNoteController::show`,
  `PaymentController::get`/`delete` (wrappers exist in `api.ts` but are
  never called). Some are genuine unbuilt features rather than bugs; left
  alone rather than guessing at UI for them.
- **Several Eloquent model relations are fully modeled but never used**
  (`Task::subtasks`/`dependencies`, `Invoice::recurringRule`/
  `parentInvoice`/`childInvoices`/`creditNotes`, `User::primaryDepartment`/
  `subordinates`, `Package::packageServices`) — same "genuine feature gap,
  not a broken promise" class already established for `PayrollAdjustment`
  in the Payroll module. Left unbuilt.
- **`ClientCommunicationController::index` and `AiController::listConversations`
  return unbounded result sets** (no pagination) — realistic growth
  vectors, but adding pagination would change the response contract and
  needs matching frontend changes; left as a flagged risk rather than a
  contract-breaking fix in this pass.
- **`PayrollRunController::costAllocation` isn't cached**, unlike the rest
  of the reporting layer's 60s-cache convention — low severity since it's
  month-scoped and bounded; left as a minor inconsistency.
- **`RoleController`'s `super-admin` in the founder-protection list is a
  phantom role name** (never seeded) — harmless (founder's own name still
  matches) but confusing; left alone since removing it is purely cosmetic.
- **`ExpenseController`/`ExpensePolicy`'s redundant `hasRole('director')`
  checks alongside the correct permission checks** — not a bug today (
  director's permission set already includes these via the seeder's
  "all except" exclusion list), but the same drift-prone pattern flagged
  elsewhere; left alone as a style-only fix with no behavior change.
- Duplicate status-badge-color logic across `invoices`, `quotes`, and
  `reports/profitability` pages was found but not consolidated — lower
  value than the currency-formatting duplication, and touching 4 files for
  a style-only refactor wasn't prioritized in this pass.

### Verification

- `php artisan test` (full suite): **178/178 passing**, 779 assertions —
  up from the 167/167 baseline at the end of the Settings & Notifications
  module (11 new tests added across `Sprint12ProductionReadinessTest`,
  `Sprint7ProfitabilityPortalTest`, `Sprint10FileUploadTest`). No
  regressions.
- `php -l` clean on all changed/added backend files.
- `npx tsc --noEmit`: clean across the whole frontend.
- `npx next build`: production build succeeds; all 49 routes compile and
  prerender cleanly (confirmed `/departments` now appears in the route
  list alongside every existing page).
- `php artisan migrate` applied the new indexes migration cleanly, no
  errors, no destructive commands used.
- Not manually browser-tested, per this project's standing instruction —
  user tests every page manually.

### Next steps
Per the user's instruction, this Production Readiness Audit is complete —
stopping here for manual testing and approval before any further work.
Recommended next step per the original module plan: **Dashboard**, since
it depends on every other module's data being correct and already has two
known bugs waiting from the Reports module's audit (a project date-overlap
filter bug, and a broken `$this->gemini` reference that silently disables
the AI executive briefing) — see the Reports module's "Remaining issues"
above.

---

## Onboarding Coverage Pass (2026-07-10)

A focused, app-wide pass (not a module audit) to close the onboarding gaps
left by earlier audits: the standing rule ("every module needs onboarding
built in") only applied from Projects & Tasks onward, so CRM and
Quotes & Invoicing — audited before the rule existed — plus the not-yet-
audited Dashboard, Clients, Services, Users, AI, and Client Portal modules
had no `HelpIcon`/`HowToUseGuide` coverage. This pass added both components
to every remaining user-facing page using the existing shared components
only (no new components, no business-logic/API/permission/workflow
changes — imports, module-level HOWTO content consts, and JSX only).

### Page-by-page checklist (entire route tree)

Legend: **Guide** = `HowToUseGuide` button in the page header
(auto-opens once per browser via its `moduleKey`); **ⓘ** = number of
`HelpIcon`s on the page (title popover + field/filter/status/calculation
tips). "prior" = already covered by an earlier module audit; "NEW" =
added in this pass.

| Route (page) | Guide (moduleKey) | ⓘ | Coverage |
|---|---|---|---|
| `/dashboard` | `dashboard` | 9 | NEW — title, all 8 KPI cards, AI Co-Pilot strip, Cash Flow, Attention Required, Project Health, Sales Pipeline, Team Performance |
| `/clients` | `clients` | 7 | NEW — title, Health Score & Portal Access columns, invite-password, status, role-assignment fields |
| `/crm` | `crm` | 10 | NEW — title, Conv. Rate/Avg Value KPI, stage & temperature filters, lead-form fields (budget, source, stage, owner) |
| `/crm/[id]` | `crm-lead-detail` | 11 | NEW — title, temperature, budget, services, contacts, activity logger, timeline, pipeline actions, stage select, follow-ups |
| `/quotes` | `quotes` | 5 | NEW — title, status filter (full lifecycle), Total Amount & Valid Until columns |
| `/quotes/create` | `quotes-create` | 9 | NEW — lead/client pickers, validity, per-line Disc %/GST, coupon, T&C, net total formula |
| `/quotes/[id]` | `quote-detail` | 5 | NEW — status badge lifecycle, submit-for-approval, approve/reject, convert-to-invoice |
| `/invoices` | `invoices` | 8 | NEW — title, 3 KPI cards, status-filter lifecycle, Balance Due column, payment-amount field |
| `/invoices/create` | `invoices-create` | 11 | NEW — quote prefill, lead, due date, Discount %/Tax Rate/Total columns, recurring toggle, taxable value & final amount |
| `/invoices/[id]` | `invoice-detail` | 6 | NEW — title, approval workflow panel, receivables tracking, payment drawer, credit-note drawer (kept out of the printable area) |
| `/projects` | `projects` | 7 | prior (Projects & Tasks audit) |
| `/projects/[id]` | `project_detail` | 3 | prior |
| `/tasks` | `tasks` | 2 | prior |
| `/timesheets` | `timesheets` | 3 | prior |
| `/timesheets/approvals` | `timesheet-approvals` | 2 | prior |
| `/attendance` | `attendance` | 3 | prior |
| `/expenses` | `expenses` | 3 | prior |
| `/expenses/[id]` | `expense_detail` | 2 | prior |
| `/payroll` | `payroll` | 7 | prior |
| `/payroll/history` | `payroll_history` | 2 | prior |
| `/payroll/[id]` | `payroll_run_detail` | 2 | prior |
| `/reports` (hub) | `reports_hub` | 0 | prior (hub cards are self-describing) |
| `/reports/revenue` | `reports_revenue` | 2 | prior |
| `/reports/pipeline` | `reports_pipeline` | 2 | prior |
| `/reports/quotes` | `reports_quotes` | 2 | prior |
| `/reports/clients` | `reports_clients` | 2 | prior |
| `/reports/expenses` | `reports_expenses` | 2 | prior |
| `/reports/payroll` | `reports_payroll` | 2 | prior |
| `/reports/profitability` | `reports_profitability` | 2 | prior |
| `/reports/utilisation` | `reports_utilisation` | 2 | prior |
| `/users` | `users` | 7 | NEW — title, status & role filters, Employee ID/Roles/Status columns |
| `/users/[id]` | `user-detail` | 6 | NEW — title, Deductions section, TDS/PF/ESI fields spelled out |
| `/users` UserFormModal | — (modal) | 5 | NEW — password, employee ID, status, roles, departments hints |
| `/departments` | `departments` | 4 | NEW — title, color tag, department-head fields |
| `/roles` | `roles_permissions` | 2 | prior (Roles & Permissions rewrite) |
| `/services` | `services` | 8 | NEW — title, base price, unit, GST, package discount model/value (help text documents the known discount-type persistence quirk), bundle picker |
| `/ai` | `ai-assistant` | 2 | NEW — title popover; guide covers chat, attachments, voice, pin/bookmark/search |
| `/ai/automations` | `ai-automations` | 7 | NEW — title, trigger, conditions, action type, project ID, active toggle |
| `/settings/*` (10 pages) | `settings_*` | 2 ea. | prior (Settings & Notifications audit; change-password has guide only) |
| `/portal/dashboard` | `portal-dashboard` | 4 | NEW — client-facing copy: title, projects list, invoice statuses |
| `/portal/projects/[id]` | `portal-project-detail` | 4 | NEW — client-facing copy: status chip, completion %, milestones vs tasks |
| Task detail slide-over | — (panel) | ✓ | prior (`TaskDetailSlideOver` HelpIcons) |

Intentionally excluded (no onboarding value): `/login`,
`/forgot-password`, `/reset-password`, `/portal/login` (auth screens),
`/` and `/settings` (pure redirects).

All 49 `moduleKey`s verified unique, so each page's guide auto-opens
independently on first visit.

### Verification

- `npx tsc --noEmit`: clean (one JSX balance error introduced on
  `invoices/page.tsx` — a lost `</div>` in the filter bar — was caught
  and fixed during this pass).
- `npx next build`: production build succeeds; all routes compile and
  prerender cleanly.
- Not browser-tested, per the standing instruction — user verifies every
  page manually.

---

## Module: Dashboard

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
The main Dashboard page (`frontend/src/app/(dashboard)/dashboard/page.tsx`) and
its backend, `ReportController::dashboardOverview` (`GET /reports/dashboard`),
plus a new `GET /reports/dashboard/briefing` endpoint. Audited against the
PRD's Founder Dashboard spec and the role-specific dashboard requirement
(Sales / Project / Employee / Finance views as filtered variants of one page).

### Findings (root causes, before fixes)
1. **Company-wide financial data leaked to every authenticated user.** Only
   sections 1–3 of `dashboardOverview` (revenue/pipeline/utilisation) were
   permission-gated; everything added later — the full attention lists with
   overdue-invoice amounts, the 6-month financial trends (revenue, expenses,
   payroll, profit), the all-employee Team Performance table, the sales
   funnel with pipeline value, active-clients count, and the executive
   briefing with revenue figures — was computed and returned unconditionally.
   A plain `employee` calling `/reports/dashboard` received all of it. Same
   class as the Reports module's PM profitability leak, but wider.
2. **`$this->gemini` was referenced but never injected** (the bug flagged in
   the Reports audit) — the AI executive briefing ALWAYS threw, was swallowed
   by the surrounding `try/catch`, and the hardcoded template fallback was
   presented under an "AI Co-Pilot" label with a pulsing "live" dot, as if a
   model wrote it. Additionally, even with injection fixed, `GeminiService::
   chatWithoutTools()` silently degrades to a mock "simulator" response when
   keyless — so callers could never distinguish real AI output honestly.
3. **The AI call sat inside the dashboard's cache closure** — with a real key
   configured, the entire dashboard payload would block on an external HTTP
   fan-out (up to 8 model attempts across two providers) once per minute.
4. **`this_month_profitability` used the `whereBetween('start_date', …)`
   filter** (the second bug flagged in the Reports audit) — ongoing projects
   that started before the current month were silently excluded from
   this-month profitability.
5. **Payroll cost in the cash-flow trends was permanently ₹0.** The query
   filtered `payroll_runs.status = 'paid'` — a state no code path ever
   reaches (runs only move `draft → approved`, per the Payroll audit). The
   Margins tab's "Payroll" column and the profit line both silently ignored
   all real payroll cost.
6. **"Pending payroll" counted approved runs as pending forever** — the
   attention counts used `whereIn('status', ['draft','submitted','approved',
   'processed'])`, but `approved` is the terminal state; a signed-off run
   never left the "pending" badge.
7. **Every KPI card rendered a hardcoded fake sparkline** (`sparkline: [20,
   35, 30, 45, …]` literals) — fabricated trend lines presented as data on
   all 8 cards, including Revenue and Net Profit, for which real 6-month
   history existed in the same payload.
8. **Two different "Net Profit" definitions on the same page**: the KPI card
   computed revenue − expenses, while the Margins table right below computed
   revenue − expenses − payroll.
9. **Severe N+1 in the Project Health loop**: for every project in
   `projects_list` it ran two aggregate queries AND re-loaded every user with
   compensation (`User::with('compensation')->get()`) — 3+ queries per
   project per dashboard load; the hourly-rate map was also independently
   re-queried by three other sections. `projects_list` itself was returned
   raw (every column of every visible project) just so the frontend could
   count actives, and lazy-loaded `manager`/`client` names per row.
10. **"Delayed projects", "active clients", and "most profitable project"
    only looked at `status = 'active'`** — `in_progress` is an equally real,
    reachable delivery status (enum fixed in the Projects audit) and was
    ignored everywhere; Project Health, meanwhile, included completed and
    cancelled projects.
11. **"Leads needing follow-up" counted every unconverted lead** — the PRD's
    "Pending Follow-ups" means scheduled `lead_followups` rows nobody has
    completed (the CRM audit built that whole subsystem), which was never
    queried here.
12. **Quick-action buttons ignored permissions** — every user saw "+ Invoice",
    "Run Payroll", etc., regardless of whether the backend would 403 the
    resulting page/action. The greeting also hardcoded a founder Crown icon
    and a "Founder" name fallback for every role.
13. **Overdue-invoice queries treated `pending_review`/`pending_approval`
    drafts as receivables** (`whereNotIn('status', ['paid','draft',
    'rejected'])` — also listing `rejected`, which isn't an invoice status,
    while missing the real `void`/`cancelled`).
14. **No "who's in today" presence widget** despite `attendance/team` serving
    exactly that data (flagged in the Attendance audit), and no per-user "my
    day" data — a plain employee's dashboard was effectively empty widgets.
15. **PRD's "Top Clients" was never rendered** even though
    `this_month_revenue.top_clients` already carried the data.
16. Fixed-column grids (`repeat(4, 1fr)`, `1fr 360px`) with no responsive
    behavior — the PRD requires mobile/tablet friendliness.

### Fixes applied
**Backend (`ReportController`, `GeminiService`, `routes/api.php`):**
- `dashboardOverview` rewritten with per-section permission gates driven by
  permission strings only (no role-name matching): financial sections
  (revenue, expenses, profitability, cash-flow trends) require
  `reports.view_financial`; sales sections (pipeline, quote stats, funnel)
  require `reports.view_sales`; utilisation + team performance require
  `reports.view_hr` or are PM-scoped to people logging time on the PM's
  projects; projects summary/health follow real project visibility
  (`projects.view_all` / scoped manager-or-member); attention lists are
  per-capability (invoices → `invoices.view_all`/financial; tasks →
  company-wide vs PM-scoped vs own-assigned; leads → `leads.view_all`/sales;
  approvals badge counts only the queues the caller can approve; payroll
  badge requires `payroll.view`). Ungated sections are simply absent from
  the payload. Cache key bumped to `dashboard_overview_v2_{user}`.
- Added `my_summary` for every user: own open/overdue task counts + top-5
  overdue list, own hours this month, and today's attendance status — the
  Employee-dashboard variant the PRD requires.
- Profitability overlap filter applied (finding #4), payroll trend statuses
  corrected to `approved/processed/paid` (finding #5), pending payroll
  narrowed to `draft/submitted` (finding #6), receivable statuses centralized
  as `approved/sent/partially_paid/overdue` (finding #13), running-project
  statuses centralized as `active/in_progress` (finding #10), pending
  follow-ups now count real open `lead_followups` (finding #11).
- Project Health: batched to 2 aggregate queries + one shared hourly-rate map
  (lazy-loaded once per request), covers running projects only, sorts
  riskiest-first, caps at 15 rows; `projects_list` (raw model dump) replaced
  by a compact `projects_summary` (total/active/completed/overdue counts +
  avg completion, per PRD's "Project Completion").
- Team performance merged into the utilisation pass (one users fetch + one
  timesheets fetch), PM-scoped, capped at 12 rows.
- **New `GET /reports/dashboard/briefing`** (`dashboardBriefing`): gated on
  `reports.view_financial`, cached 5 minutes, computes its own headline
  metrics (including the most-profitable-project scan that previously ran on
  every dashboard load only to feed the AI prompt). `GeminiService` is now
  properly constructor-injected, and a new `GeminiService::isConfigured()`
  distinguishes "a real model can be called" from the mock fallback. The
  response carries `source: 'ai' | 'system'` — `ai` only when a model
  actually produced valid output; otherwise the metrics template is returned
  and labeled `system`. The dashboard payload no longer contains
  `executive_briefing` at all.
- Removed now-unused `Quote`/`Gate`/`JsonResponse` imports.

**Frontend (`dashboard/page.tsx`, `api.ts`):**
- Sections render from what the backend actually returned (data-presence
  driven), so UI visibility can never disagree with server authorization;
  separate queries (briefing, presence) are gated by the same permission
  strings the backend checks.
- KPI cards composed per role: financial viewers get Revenue / Net Profit /
  Outstanding (badge now honestly says "N billed", not "N unpaid"); sales
  viewers get New Leads / Conversion Rate; project viewers get Active
  Projects (with overdue + avg-completion subtext); HR/PM get Team
  Utilisation; plain employees get My Open Tasks / My Hours / Today's
  attendance cards instead of empty company widgets.
- Fake sparklines deleted; Revenue and Net Profit cards now draw their
  sparklines from the real 6-month `financial_trends`; cards without real
  history have none.
- One Net Profit definition everywhere: revenue − expenses − payroll
  (identical to the Margins table), now correct because payroll cost is real.
- Executive briefing strip: renders only for financial viewers, from the new
  endpoint, with its own loading shimmer and error state; labeled "AI
  Executive Briefing" (with live dot) only when `source === 'ai'`, otherwise
  "Executive Summary — auto-generated · AI briefing unavailable" with a
  HelpIcon explaining exactly why. Template text is never presented as AI.
- New **My Day** panel for every user (open tasks, overdue list, hours this
  month, clock-in status, each linking to its module).
- New **Who's In Today** presence widget fed by the existing
  `attendance/team` endpoint, shown only to `attendance.view_all` holders
  (mirroring the backend's `viewTeam` gate): in/on-leave/not-in counts plus
  clocked-in people with clock-in times.
- New **Top Clients** card (financial viewers) from
  `this_month_revenue.top_clients` — the PRD Founder Dashboard item that was
  never rendered.
- Attention Required: tabs are built only from the lists the backend
  returned; rows link to detail pages (`/invoices/{id}`); footer chips show
  personally-actionable approvals and payroll runs awaiting sign-off.
- Quick actions filtered by the caller's real permission strings
  (`leads.create`, `quotes.create`, `invoices.create`, `projects.create`,
  `tasks.create`, `payroll.manage`; "+ Expense" stays for everyone since any
  employee may log expenses). Founder Crown/"Founder" fallback removed.
- Responsive: all fixed grids converted to Tailwind responsive classes
  (KPI grid collapses 4→2→1; side-by-side panels stack on smaller screens);
  wide tables wrapped in `overflow-x-auto`.
- Guide + help pass: `HowToUseGuide` rewritten for the role-adaptive
  behavior; every KPI/panel HelpIcon updated to state exactly what is
  measured and how it is scoped (current-state funnel vs this-month KPIs,
  PM-scoped team tables, billed-vs-collected).
- `api.ts`: added `reports.getDashboardBriefing()` + `DashboardBriefing`
  type documenting the `source` contract.

### Remaining issues
- **Department Profitability** (a PRD Founder Dashboard line item) is not on
  the dashboard — projects cannot be linked to departments anywhere in the
  product (the `project_departments` pivot has no endpoints or UI; the
  non-functional picker was removed in the Projects audit), so the figure is
  currently uncomputable. Logged as a product gap that needs the Projects
  module to grow department linkage first, not as a dashboard bug.
- The Sales funnel maps the PRD's "Fresh Lead" to `temperature = 'cold'`
  (the real enum) — labels stay "Fresh" in the UI; noted here in case the
  business ever wants a real stage-based funnel instead of temperature-based.
- `attention_required.counts.invoices_amount` is returned but not yet
  rendered (the Pay tab shows per-invoice amounts); available for a future
  headline figure.
- The briefing cache is global (all financial viewers share one briefing) —
  intentional, since its inputs are company-wide, but noted.

### Performance improvements
- Project Health: from 3+ queries per project (including a full users+
  compensation load per project) to 2 batched aggregates + one shared
  hourly-rate map per request.
- Team performance no longer re-fetches all users/timesheets separately from
  the utilisation section (merged into one pass), and both are skipped
  entirely for users not entitled to them.
- The external AI call is out of the dashboard request path entirely
  (separate endpoint, 5-minute cache) — dashboard latency no longer depends
  on Gemini/OpenRouter availability.
- Raw `projects_list` (all columns × all projects) removed from the payload
  in favor of a 5-field summary; health table capped at 15 rows, team table
  at 12.

### UI/UX improvements
- Every role now gets a dashboard that is genuinely theirs: founders/finance
  see money, sales sees pipeline, PMs see their projects/team, and plain
  employees get a useful My Day instead of blank company widgets.
- No fabricated visuals remain (fake sparklines gone; real history drawn
  where it exists).
- The briefing is honest about whether AI wrote it, and the dashboard no
  longer stalls on AI availability.
- "Who's In Today" finally surfaces live presence on the dashboard.
- Mobile/tablet layouts stack properly per the PRD's responsiveness demand.

### Verification
- `php artisan test` (full suite): **185/185 passing** — up from the
  178/178 baseline; 7 new tests in `Sprint13DashboardTest` cover
  section gating by role (founder vs employee, plus PM-scoped sections and
  director parity), employee task-scoping,
  the ongoing-project profitability regression, briefing authorization +
  honest `source: 'system'` in a keyless environment, pending-payroll
  excluding approved runs, and approved payroll appearing in the cash-flow
  trends. No regressions.
- `php -l` clean on all changed backend files.
- `php artisan route:list --path=reports` confirms clean registration of
  `GET reports/dashboard/briefing` alongside the existing routes.
- `npx tsc --noEmit`: clean across the whole frontend.
- `npx next build`: production build succeeds; all routes compile.
- No seeder or migration changes were needed (no destructive DB commands).
- Not manually browser-tested, per this project's standing instruction — the
  user tests every module manually.

### Next recommended module
Clients — the audit file's known gaps are the missing `/clients/[id]` detail
page (breaking cross-linking from Projects/Invoices/Leads) and any remaining
`res.data.data` unwrapping bugs on the Clients pages.

---

## Module: Clients

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
The Clients list page, the new per-client detail page (`/clients/[id]`), the
new `ClientController` API surface, `ClientCommunicationController`, the
client pickers on the Quote/Invoice/Project create forms, and client
cross-linking from Projects, Invoices, and CRM. Audited against the PRD's
client spec (company, multiple contacts, currency, billing details, active +
closed projects, revenue history, outstanding amount).

### Findings (root causes, before fixes)
1. **The whole Clients module was gated on the wrong permissions.** The page's
   data source was `reports/clients` (requires `reports.view_sales` or
   `reports.view_financial`) and its edit/invite/delete flows used the Users
   endpoints (require `users.view`/`users.edit`/`users.create`/`users.delete`).
   But the sidebar shows Clients to anyone with `clients.view`, and the roles
   the module is built for hold only `clients.*`: a **sales_exec got a 403 on
   the entire page**, and a **sales_head could see the list but 403'd on
   every edit, invite, and delete** — despite the seeder granting them
   `clients.create/edit/delete` explicitly. The `clients.*` permission strings
   existed since day one and were checked by nothing.
2. **The client pickers on Quote create, Invoice create, and Project create
   only ever worked for founders/directors.** All three built their dropdown
   via `GET /roles` (requires `roles.view` — held by founder/director only)
   followed by `GET /users?role_id=…` (requires `users.view`) — so for the
   very roles those forms exist for (sales creating quotes, finance creating
   invoices, PMs creating projects) both calls 403'd and the picker rendered
   silently empty, masked by try/catch-to-empty-array. The CRM
   convert-to-quote modal's "use existing client" dropdown had the same
   silent-403 problem via `reports/clients`.
3. **`ClientCommunicationController` had zero authorization** — any
   authenticated user (including client portal accounts) could list, create,
   and delete communication logs for ANY client. Same class as the
   CreditNoteController gap found in the Invoicing audit.
4. **No per-client detail page existed** (modal-only), so nothing could
   cross-link to a client — flagged in the Production Readiness audit as a
   genuine cross-module gap. Projects, invoices, and converted leads showed
   client names as plain text.
5. **The PRD's client fields had no schema at all**: no company name (the
   "client" was just a user whose `name` doubled as the company), no multiple
   contacts, no billing address, no tax number, no per-client currency.
6. The details modal's health-score breakdown showed the word "Applicable"
   for every deduction row instead of the client's actual numbers — only the
   outstanding-ratio row was real.
7. The list page's money columns were presented as all-time ("All project
   invoice records") but `reports/clients` defaults to the Indian financial
   year — figures silently excluded anything before April.
8. Client delete had **no in-use guard** (a client with projects/invoices
   could be deleted, orphaning them via `nullOnDelete`) and the confirm copy
   claimed deletion was "permanent" and "cannot be undone" — false: users
   soft-delete into the founder-restorable Recovery Bin.
9. The Edit Client modal offered a **Role Assignment dropdown listing every
   staff role** (founder included) on a client account — role changes belong
   to the Users module (and its founder-assignment guard), not a client
   profile form.
10. `FinancialReportService::getClientSummary` counted only `status='active'`
    projects as active — `in_progress` ignored (same class as the Dashboard
    module's finding #10).
11. The topbar "Quick Create" menu (AppShell) offered all six create actions
    (New Client, New Invoice, New Project…) to every user regardless of
    permissions — same "buttons that 403" class, found while wiring the
    Clients entry.
12. Invite modal defaulted the initial password to the literal string
    `"password"` — a footgun the guide itself warned about.

### Fixes applied
**Backend:**
- **New `ClientController`** (`GET/POST /clients`, `GET/PUT/DELETE
  /clients/{client}`, plus `POST/PUT/DELETE /clients/{client}/contacts/…`),
  gated on the real `clients.*` permission strings. `index` returns the
  directory with LIFETIME billing aggregates (batched queries, running =
  active+in_progress) and health scores; `store` creates the client account
  itself (assigns the `client` role internally, portal access on, welcome
  email queued, soft-delete-spanning email dedupe — same pattern as
  `UserController::store`); `update` covers profile/billing/portal and can
  never touch roles; `destroy` soft-deletes with an in-use guard (422 with a
  "deactivate instead" message while projects or invoices reference the
  client). `show` returns the full PRD payload: profile + billing, contacts,
  projects grouped active/pipeline/closed, latest invoices + quotes with
  totals, lifetime billed/paid/outstanding, a 12-month billed-vs-collected
  history, and the health score WITH its real component numbers.
- **Additive migration**: `users.company_name/billing_address/tax_number/
  default_currency_id` (nullable; staff rows unaffected) and a new
  `client_contacts` table (name/email/phone/designation/is_primary) + model —
  the PRD's "Contacts (Multiple), Currency, Billing Details" finally exist.
  Primary-contact flag is exclusive (setting one demotes the others).
- `ClientCommunicationController`: `index`/`store` now require
  `clients.view`; `destroy` requires `clients.edit` or being the log's own
  recorder.
- `RolesPermissionsSeeder`: `finance` gains `clients.view` (they bill
  clients; the invoice builder needs the directory). Re-run locally
  (additive `syncPermissions`).
- `getClientSummary` active-projects definition fixed to include
  `in_progress`.

**Frontend:**
- **New `/clients/[id]` detail page**: header with company/status/portal
  badges and lifetime money KPIs; tabs for Overview (billing details +
  health breakdown with real per-client numbers + 12-month revenue history
  chart), Contacts (full CRUD, primary flag), Projects (grouped
  active/planning-on-hold/closed, rows link to `/projects/{id}`), Invoices
  and Quotes (rows link to their detail pages, honest "showing latest 25"
  note), and Communications (log + timeline, moved here from the old
  slide-over). Edit modal covers company, billing address, tax number,
  preferred currency (real active-currency list from platform settings),
  status, and portal access. Delete is `clients.delete`-gated with honest
  Recovery Bin copy. Dedicated 404/403/error states with a back link.
- **List page rewired to `clientsApi.list()`**: money columns are now truly
  lifetime and labeled so; rows navigate to the detail page; Add
  Client/Edit/Delete/portal-toggle appear only with
  `clients.create/edit/delete`; the role dropdown is gone from client
  editing; the invite modal gained a Company field, an 8-char password
  minimum with no "password" default, and posts to `POST /clients` (no
  users.create needed); distinct "no clients yet" (action: add first client)
  vs "no match" (action: clear search) empty states; error banner with
  retry.
- **Client pickers fixed on all three create forms** (quotes/create,
  invoices/create, projects list's create modal) and the CRM convert
  modal: all now use `clientsApi.list()` (one call, `clients.view`), show
  company names, and surface a visible error instead of a silent empty
  dropdown.
- **Cross-linking**: project detail's client name links to the client page;
  invoice detail gains a "View client page →" link (print-hidden so the
  invoice document is unchanged); a converted lead links to the client
  account it created; the client page links back into projects, invoices,
  and quotes — the lifecycle chain is navigable in both directions.
- AppShell's Quick Create menu is now permission-filtered with the same
  strings the backend enforces (New Expense stays for everyone by design).
- `api.ts`: full typed surface (`ClientDirectoryData`, `ClientDetail`,
  `ClientContact`, `ClientUpdatePayload`, …) documenting the interceptor
  behavior for the `{summary, breakdown}` payload.
- Onboarding: `HowToUseGuide` rewritten on the list page and added to the
  detail page (`clients-detail`); HelpIcons on health score (with the exact
  formula), lifetime-money columns, portal access, currency, primary
  contact, and password field.

### Remaining issues
- The health-score formula now lives in two places (`ClientController` and
  the date-scoped Client 360 report in `FinancialReportService`) — kept in
  sync manually with comments pointing at each other; consolidating into a
  shared service is a Module H cleanup candidate.
- The project create modal's *manager* picker still uses `usersApi.list`
  (requires `users.view` that PMs don't hold) — same silent-empty class as
  the client pickers fixed here, but it belongs to the Projects/Users
  modules; logged for Module D (Users) where an assignable-users decision
  is needed.
- Client statuses include `suspended` (users table enum) but nothing
  server-side blocks a suspended client's portal login beyond the portal
  access flag — flagged for the Client Portal module's audit (F).
- Quote detail doesn't render a client block (only the lead link) — its
  printable layout is quote-focused; left as-is, the chain is reachable via
  lead → client.
- `LeadController::convert` doesn't populate the new `company_name` on
  auto-created client accounts (it sets `name` from the contact) — low
  priority: it could copy the lead's company; logged for a future CRM touch.

### Performance improvements
- Directory endpoint batches all aggregates (4 grouped queries total,
  no per-client queries); the detail endpoint computes totals + 12-month
  history from one lightweight invoice fetch instead of per-month queries.

### UI/UX improvements
- Sales and finance roles can actually use the module their sidebar has
  always advertised (list, invite, edit, delete, pickers).
- The agency lifecycle is finally traversable: lead → client → quotes →
  invoices → projects, clickable in both directions.
- Health score shows this client's real deductions instead of "Applicable".
- Deleting is guarded and honestly described; deactivation is the promoted
  path.

### Verification
- `php artisan test` (full suite): **193/193 passing** — 8 new tests in
  `Sprint14ClientsTest` covering directory gating (sales_exec 200 / employee
  403 / finance 200), the detail payload (projects grouping incl.
  in_progress, totals, 12-month history, health components, staff-id 404),
  invite gating + client-role assignment + welcome mail, update gating +
  billing persistence + role-injection immunity, the delete in-use guard +
  soft delete, contact CRUD + exclusive primary flag, and the
  communications authorization regression. One pre-existing test
  (`Sprint10ClientCompletionTest::test_client_communications_crud`) was
  updated to the new contract — it previously exercised communications
  CRUD as a plain employee, i.e. it asserted the unauthorized access
  this module closed; it now asserts the employee 403 and runs the CRUD
  as a sales exec. No other changes across the suite.
- `php -l` clean on all changed/added backend files.
- `php artisan migrate` applied the additive migration cleanly (no
  destructive commands); `php artisan route:list --path=clients` shows all
  12 module routes registered cleanly.
- Re-ran `RolesPermissionsSeeder` (additive) for the finance grant.
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds;
  `/clients/[id]` compiles alongside all existing routes.
- Not manually browser-tested, per this project's standing instruction — the
  user tests every module manually.

### Next recommended module
Services & Packages — the known package `discount_type`/`discount_value`
persistence bug is next, and quotes/invoices consumption of catalog data can
now be verified against a client chain that works end-to-end.

---

## Module: Services & Packages

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
The Service Catalog page (services + bundled packages), `ServiceController`/
`ServiceCategoryController`/`PackageController`, the `Package`/`PackageService`
models, and how the catalog is consumed downstream. Audited against the PRD's
Service Catalog and Packages sections.

### Findings (root causes, before fixes)
1. **Package `discount_type`/`discount_value` didn't persist** (the known bug
   this module's audit was commissioned to fix). The backend stored only the
   final `price`; the page then fabricated `discount_type: 'fixed'` and a
   derived difference on every reload — a package saved with a 15% discount
   silently redisplayed as a fixed-amount discount, and the on-page help text
   documented the lie as a quirk.
2. **New packages were hardcoded to `currency_id: 1` with a `// Default to
   INR` comment** — the exact guessed-id class of bug already fixed on the
   Expenses module's currency pickers. A platform whose default currency isn't
   row id 1 would silently save every package in the wrong currency.
3. **All three catalog queries swallowed failures** (`try/catch` → `[]`), so
   an outage rendered as an empty catalog with no error state. (The
   Production Readiness audit had recorded these as fixed — they weren't; the
   masking was still in the code.)
4. **Every manage affordance ignored `services.manage`**: "New Service",
   "New Package", and the per-card edit/delete buttons rendered for anyone
   who could open the page (services.view — sales roles, PMs), but the
   backend 403s all of it without `services.manage` (founder/director only).
5. `Package::packageServices` and `Service::packageServices` were
   modeled-but-unused `HasMany` accessors (the real relation goes through the
   `services()` BelongsToMany using `PackageService` as its pivot class) —
   the flagged dead relations for this module.
6. Packages exist in the catalog but are not insertable into quotes or
   invoices anywhere — see Remaining issues (the quote builder consumes
   individual services correctly; nothing in the UI falsely implies package
   insertion works).

### Fixes applied
**Backend:**
- Additive migration: `packages.discount_type` (nullable string) and
  `packages.discount_value` (decimal, default 0). Legacy rows keep NULL
  discount_type. Model fillable/casts updated; `PackageController`
  store/update validate (`in:percentage,fixed`, `min:0`) and persist both;
  `PackageResource` exposes them.
- Removed the two unused `packageServices` HasMany accessors (the
  `PackageService` pivot class itself remains in use by the real relation).

**Frontend (`services/page.tsx`, `api.ts`):**
- The packages query now trusts the stored `discount_type`/`discount_value`;
  only legacy NULL rows fall back to the derived fixed-amount display. The
  package card's "Bundled Special" figure now reads the stored `price`
  directly instead of recomputing it.
- The package form submits the discount fields, and new packages use the
  platform's real default currency (from `/settings`) instead of id 1;
  editing preserves the package's existing currency.
- The three catalog queries surface real errors (page-level banner) instead
  of masking outages as an empty catalog.
- "New Service"/"New Package" and all edit/delete card actions now render
  only for `services.manage` holders — matching what the backend enforces.
- Help text updated: the guide and the discount HelpIcon now say discounts
  persist exactly as entered (the "redisplays as fixed" quirk documentation
  is gone because the quirk is gone).
- `Package` type in `api.ts` gained the real backend fields
  (`price`, `currency_id`, `billing_cycle`, nullable-on-legacy discount doc).

### Remaining issues
- **Packages cannot be inserted into a quote or invoice** — the quote builder
  consumes individual catalog services (correctly, with GST per service), but
  there is no "add package" affordance anywhere, so packages are effectively
  a price-list display. Nothing in the UI pretends otherwise, so this is an
  honest feature gap rather than a broken promise: building it means deciding
  how a bundle discount maps onto quote line items (per-line discount_percent
  vs a single bundle line). Flagged as the natural next feature for this
  module.
- The seeded catalog is a 6-service starter set, not the PRD's full ~30
  master-service list. The PRD's three master categories exist (as "Digital
  Marketing" / "Development" / "Branding", plus a "Copywriting" extra), and
  services are fully user-manageable through the UI — the catalog is business
  data the team curates, so the full PRD list was NOT force-seeded into the
  live database. If the user wants it pre-loaded, an additive
  `firstOrCreate` seeder can be added on request.
- Package deletion has no in-use guard, but nothing references packages yet
  (see the first item) — revisit when packages become insertable.

### Performance improvements
- None needed — catalog queries are small and eager-load currency/services.

### UI/UX improvements
- A percentage-discount package finally survives a reload as a percentage.
- Wrong-currency packages can no longer be created silently.
- Catalog outages are visible instead of masquerading as an empty catalog.
- Users who can't manage the catalog no longer see buttons that would 403.

### Verification
- `php artisan test` (full suite): **197/197 passing** — 4 new tests in
  `Sprint15ServicesPackagesTest`: percentage discount survives reload (+
  update to fixed persists), legacy NULL-discount rows still serve, invalid
  discount_type 422s, and the services.manage boundary (employee 403 on
  browse, sales_exec browses but can't create). No regressions.
- `php -l` clean on all changed backend files; `php artisan migrate` applied
  the additive packages migration cleanly.
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds.
- Not manually browser-tested, per this project's standing instruction.

### Next recommended module
Users, Departments & Roles (verification pass) — includes the deferred
decision on `User::subordinates` reporting lines, the Compensation tab loop,
and the phantom `super-admin` in `RoleController`.

---

## Module: Users, Departments & Roles (verification pass)

**Status:** ✅ production-ready (completed 2026-07-10)

### Scope
A verification-and-completion pass over the people-management surface, per
the completion directive: Users list/detail/create/edit vs the PRD
(multi-role, multi-department, many-to-many reporting), the Compensation tab
loop, the phantom `super-admin` in `RoleController`, and re-confirming the
Sprint-12 privilege-escalation protections. (Roles & Permissions itself was
rewritten in the Production Readiness audit and needed no rework.)

### Findings (root causes, before fixes)
1. **Reporting lines existed only at creation.** `UserController::store`
   accepted `manager_ids` and synced the `manager_relationships` pivot, and
   `UserResource` returned `managers` — but `update()` silently ignored
   `manager_ids` (a reporting line could never be changed after creation),
   the create path flagged EVERY manager `is_primary` (making the flag
   meaningless), nothing prevented self-reporting, and **no UI anywhere
   collected or displayed managers** — the PRD's many-to-many reporting was
   backend-only dead weight. `User::subordinates` remains the inverse
   accessor of the now-fully-wired `managers` relation.
2. **`RoleController` protected a phantom `super-admin` role** in three
   guard lists (`update`/`destroy`/`syncPermissions`) — never seeded,
   flagged in the Production Readiness audit.
3. **`resetPassword` used role-name matching** (`hasAnyRole(['founder',
   'director', 'hr'])`) instead of the permission system — the exact
   anti-pattern eliminated everywhere else; equivalent access lives on
   `users.edit`.
4. The Payroll audit's flagged "fix a typo" affordance was still missing:
   the Salary Setup modal always created a NEW versioned compensation
   record, even when opened from an existing row — correcting a data-entry
   mistake polluted the salary history with a bogus "revision". (The Users
   detail page's Compensation tab had already been rewired to the in-place
   `update` endpoint for TDS/PF/ESI during the Production Readiness pass —
   verified working.)
5. The user detail Profile tab showed only email/employee-id/phone — no
   roles, departments, or reporting lines, despite the PRD treating those
   as the core of a person's record.

### Fixes applied
**Backend:**
- `UserController::update` now syncs `manager_ids` (validated, privileged
  behind the same `users.edit` gate as role/department changes — the
  self-profile bypass never reaches it); both create and update drop
  self-reporting and flag only the FIRST listed manager as the primary
  reporting line.
- `RoleController`: phantom `super-admin` removed from all three guards
  (founder-role protection unchanged).
- `resetPassword` gates on `hasPermissionTo('users.edit')` — identical
  effective access (founder/director/hr), now permission-driven.

**Frontend:**
- `UserFormModal` gained a **Reports To** multi-select (active staff only,
  client portal accounts and the edited person excluded, first pick labeled
  PRIMARY, HelpIcon explaining multi-manager reporting); prefills from the
  user's real managers via the show endpoint (the list payload doesn't carry
  them) and submits `manager_ids` on both create and update.
- The user detail Profile tab now shows roles, departments, and "Reports To"
  (with an honest "No reporting line set" empty value).
- **Payroll Salary Setup**: opening an existing record now offers an explicit
  choice — "New salary record (pay change — keeps history)" vs "Correct this
  entry (fix a typo — no new version)", the latter finally wiring
  `EmployeeCompensationController::update` from the payroll page. The
  employee picker locks during a correction and the submit button says which
  of the two actions it will take.
- `api.ts`: `manager_ids` on Create/Update payload types, `managers` on the
  `User` type.

### Verified (no changes needed)
- Multi-role and multi-department assignment work end-to-end (modal
  checkboxes → `syncRoles`/`syncDepartments`, first department primary).
- Founder-role assignment protection, the `users.edit` gate on
  role/department changes, and the self-service profile-edit bypass all hold
  — `Sprint12ProductionReadinessTest` still green.
- The Compensation tab loop (view current → in-place TDS/PF/ESI correction →
  versioned records from Payroll's Salary Setup) works against the real API.

### Remaining issues
- The project create modal's **manager picker** (and the Users page itself)
  rely on `usersApi.list`, which requires `users.view` — a project_manager
  creating a project sees an empty manager dropdown (silent 403 → []). The
  right fix is a scoped "assignable staff" endpoint or a considered
  permission grant; deferred to Module H's final sweep with this note rather
  than hastily granting PMs user-directory access.
- Reporting lines are assignable and visible, but no org-chart or
  "my team" view consumes `User::subordinates` yet — the PRD's reporting
  structure is now functional (assign + display); a visualization is a
  future feature, not a broken promise.
- `resetPassword` responses don't force portal-token invalidation — noted
  for the security sweep (Module H) alongside the existing
  change-password-revokes-tokens behavior.

### Performance improvements
- None needed; user queries were already paginated with eager loads.

### UI/UX improvements
- Reporting lines are finally a real, editable part of a person's record.
- Fixing a salary typo no longer fabricates a fake pay-change history entry.
- The profile page tells you who someone is (roles/departments/manager), not
  just how to email them.

### Verification
- `php artisan test` (full suite): **200/200 passing** — 3 new tests in
  `Sprint16UsersRolesTest`: manager sync on update (dedupe of self, primary
  = first, employee 403), password-reset permission gating (hr 200,
  employee 403), and founder-role protection after the phantom removal.
  No regressions (Sprint12's escalation tests included).
- `php -l` clean on all changed backend files.
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds.
- No migrations or seeder changes; no destructive DB commands.
- Not manually browser-tested, per this project's standing instruction.

### Next recommended module
AI Assistant & Automations — honest AI-enabled states everywhere, pagination
on `listConversations`, and truthful automation types.

---

## Module: AI Assistant & Automations

**Status:** ✅ production-ready (completed 2026-07-11)

### Scope
The AI chat page (`/ai`), automations (`/ai/automations`), `AiController`,
`AiAutomationController`, `AiAutomationObserver`, and how the app represents
AI availability everywhere (`GEMINI_API_KEY` is env-only by design — see the
Settings module's product note).

### Findings (root causes, before fixes)
1. **Nothing told the user whether a real AI model was connected.** With no
   API key, `GeminiService` silently degrades to a canned "simulator"
   response — the chat page presented itself identically either way ("AI
   Operating Assistant"), and only the simulator's own reply text admitted
   the truth after you'd already sent a message. There was no API to even ask
   "is AI real right now?".
2. **`listConversations` was unbounded** (flagged in the Production
   Readiness audit) — every conversation a user ever created came back in
   one response, growing forever.
3. **Automations gave no evidence of ever running.** No last-run timestamp,
   no counter, no log — a rule that never fired (e.g. a condition typo) was
   indistinguishable from one firing daily. The directive's "testable
   automations" requirement had nothing to stand on.
4. **The `create_task` automation action defaulted to `project_id ?? 1`** —
   with no project configured, tasks were silently created inside whatever
   project happened to have id 1 (or threw FK errors swallowed by the
   catch-all). It also never set `created_by`.
5. **A `task.created` rule with a `create_task` action would loop forever**
   — the created task re-fired the observer, which re-matched the rule.
   Nothing guarded against the cascade.
6. **Deleting a conversation had no confirmation** — the trash icon
   permanently dropped a chat and its history in one click (the same gap
   fixed for automations in the Production Readiness pass, missed for
   conversations).
7. Verified fine (no changes): the automation picker only offers the
   trigger events and the two actions the observer really implements — no
   decorative options to remove; chat/file-upload error toasts (added in the
   Production Readiness pass) are still wired; sidebar/topbar/palette gating
   on `NEXT_PUBLIC_AI_ENABLED` holds; conversation previews eager-load.

### Fixes applied
**Backend:**
- **New `GET /ai/status`** → `{enabled, configured, model}` where
  `configured` uses `GeminiService::isConfigured()` (added in the Dashboard
  module) — true only when a real model call is possible.
- `listConversations` now paginates (default 50/page, capped 100), pinned
  first then most recent.
- `AiAutomationObserver`:
  - Additive migration adds `last_triggered_at` + `trigger_count` to
    `ai_automations`; every successful execution stamps both (quietly, no
    event cascade) and writes an `ai_audit_logs` row
    (`automation_executed`) — a real activity trail.
  - `create_task` now REQUIRES a valid `project_id` (skips with a warning
    log instead of guessing project 1) and sets `created_by`.
  - Re-entrancy guard: records created by an automation never trigger
    further automations — the task.created → create_task infinite loop is
    closed.

**Frontend:**
- Chat header shows an honest state: "Simulation mode — no AI model
  connected" plus a warning chip with a HelpIcon explaining exactly why
  (no `GEMINI_API_KEY`) and that replies are canned demos — vs the normal
  assistant state when a model is configured.
- Conversations sidebar consumes the paginated response; when more than one
  page exists it says "Showing your 50 most recent chats — use search to
  find older ones" instead of silently truncating.
- Automations page: each rule shows "Ran N times · last on {date}" or "Has
  not fired yet — it runs the next time its trigger event happens", with a
  HelpIcon giving the most common reason a rule never fires (condition
  value mismatch). This is the honest testability signal the directive
  asked for.
- Conversation deletion now goes through a `ConfirmModal`.
- `api.ts`: `aiApi.status()` + `AiStatus` type; paginated
  `listConversations` typing; `last_triggered_at`/`trigger_count` on
  `AiAutomation`.

### Remaining issues
- A "dry-run/preview" button for automations was considered and NOT built:
  the observer's real side effects (create a task, send an alert) can't be
  previewed without executing them, and simulating the condition check
  against a hand-picked record is a bigger feature than the activity trail
  the directive's intent (can I tell it works?) required. The last-run
  trail + audit log rows cover that intent; a sandboxed dry-run is logged
  as a future feature.
- `voiceTalk` and chat rely on the same GeminiService degradation — in
  simulation mode the voice call also produces canned output; the header
  banner covers the whole page, so no separate voice-specific state was
  added.
- AI configuration remains env-only (`GEMINI_API_KEY`) — unchanged, per the
  Settings module's recorded product decision.

### Performance improvements
- Conversation list no longer grows unbounded (pagination).

### UI/UX improvements
- Users can finally tell real AI from simulation before typing anything.
- Automations prove they run (or clearly say they never have).
- No more one-click permanent chat deletion.

### Verification
- `php artisan test` (full suite): **204/204 passing** — 4 new tests in
  `Sprint17AiTest`: pagination shape, keyless status honesty
  (`configured: false` in testing), automation firing stamps
  last_triggered_at/trigger_count + alert + audit log, and the
  create_task project guard + cascade protection (exactly one chained task,
  no ghost task, no infinite loop). No regressions.
- `php -l` clean on all changed backend files; additive migration applied
  cleanly; `php artisan route:list` clean for `GET ai/status`.
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds.
- Not manually browser-tested, per this project's standing instruction.

### Next recommended module
Client Portal — read-only scope verification, staff-token 403 regressions,
and client-presentable polish.

---

## Module: Client Portal

**Status:** ✅ production-ready (completed 2026-07-11)

### Scope
Portal login, dashboard, project list/detail (status, milestones, completion
%), invoices and payment history, `PortalController`, the portal token model,
and client-facing copy — against the PRD's strictly read-only portal scope.

### Findings (root causes, before fixes)
1. **Portal tokens could call the entire staff API.** Portal logins issue
   Sanctum tokens scoped `['portal:read']` and staff logins `['*']` — but no
   route ever checked token abilities, so the scoping was decorative: a
   client's portal token could hit every staff endpoint, gated only by
   whatever each policy happened to allow the `client` role (which the
   seeder grants `projects.view`/`tasks.view`/`invoices.view`), including
   oddities like clocking in on the attendance system. The reverse direction
   (staff tokens → portal routes) was closed in the Production Readiness
   audit; this direction never was.
2. **Suspending or deactivating a client did not lock them out of the
   portal.** Login checked only the role and the portal-access flag — the
   `status` field the Clients page sets (`inactive`/`suspended`) was never
   consulted, and an already-issued token kept working regardless. (Flagged
   in the Clients module audit.)
3. **Clients could see internal draft invoices.** `PortalController::invoices`
   listed every invoice on the account with no status filter — drafts and
   pending-approval invoices (internal workflow states with potentially
   unfinished amounts) appeared in the client's payment history.
4. **The project page's status chip leaked internal jargon**: project
   statuses (`planning`, `active`, `on_hold`) fell through the task-status
   map to raw enum text like "on_hold".
5. **No "contact your account manager" path existed** — the guide text told
   clients to contact their project manager, but nothing on any portal page
   said who that was or how to reach them (the detail endpoint already
   loaded `manager`, unrendered).
6. Verified fine (no changes): the portal axios interceptor fix holds
   (milestones/meta preserved — regression-tested); task/milestone status
   chips already use plain-language labels matching the REAL task enum
   (todo/in_progress/review/blocked/done); pagination works; mobile layout
   uses fluid max-widths; the login/dashboard/detail pages have client-facing
   guides from the Onboarding pass.
7. **Found in passing — a cross-module data bug**: the task status enum is
   `done`, not `completed`, yet `ReportController` (Dashboard module)
   filtered on `'completed'` everywhere — "Tasks Done" in Team Performance
   has always been 0, and overdue-task counts included finished tasks. Fixed
   here (whereNotIn ['done','cancelled'] for open/overdue; 'done' for
   completed counts) because Module A's tests were written against the same
   wrong constant; also fixed the AI tool schema advertising the
   non-existent `in_review`/`completed` statuses.

### Fixes applied
**Backend:**
- New `EnsureStaffToken` middleware on both staff route groups: requests
  bearing a token that can't `staff-api` (i.e. anything but a `['*']` staff
  token) get an explicit 403 — portal sessions are now locked to the portal
  routes. Test logins via `actingAs` (no token) are unaffected.
- `PortalController::login` and `assertIsPortalClient` now require
  `status === 'active'` — suspension blocks new logins AND kills existing
  sessions on their next request, with a message pointing the client to
  their account manager.
- `PortalController::invoices` only returns issued invoices
  (`sent`/`partially_paid`/`paid`/`overdue`).
- `ReportController` task-status corrections + GeminiService tool-schema
  status list (finding #7).

**Frontend:**
- Project status chip now has a client-facing project map ("Getting
  Started", "In Progress", "On Hold", "Completed", "Closed").
- New "Your account manager" block on the project page: manager name plus a
  one-click "Send a message →" mailto (pre-filled subject with the project
  name) — the concrete contact path the PRD's client-service intent needs.
- `PortalProject` type gained the `manager` field.

### Remaining issues
- Payments surface as `payments` inside each invoice (amount/date/method) —
  a dedicated "payment history" page wasn't added since the invoice cards
  already render payment state; flagged as polish-not-gap.
- The portal has no notification/email surface (nothing pretends otherwise);
  invoice-sent emails belong to Module G's notifications backlog.
- `cancelled`/`void` invoices are hidden from the portal along with drafts —
  if the business wants clients to see a cancelled-after-sending invoice,
  that's a one-line status-list change; defaulted to hiding.

### Performance improvements
- None needed — portal queries are paginated with eager loads.

### UI/UX improvements
- Clients see only client-language statuses and only real, issued invoices.
- Every project page now says who your account manager is and how to reach
  them.
- A suspended account gets an honest, actionable message instead of
  continuing to browse.

### Verification
- `php artisan test` (full suite): **207/207 passing** — 3 new tests in
  `Sprint18PortalTest`: suspended-client lockout (new logins + existing
  token), portal tokens 403 on staff endpoints (projects, dashboard,
  clock-in) while portal routes still work and staff tokens are unaffected,
  and draft/pending invoices never reaching the portal. The pre-existing
  staff→portal 403 regression tests stay green.
- `php -l` clean on all changed backend files.
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds.
- Not manually browser-tested, per this project's standing instruction.

### Next recommended module
Cross-cutting completion (Module G): notifications backlog, scheduled jobs
(overdue sweep, recurring invoices, task templates), leave↔attendance link,
chat honesty check, and the unreachable-endpoint decisions.

---

## Module: Cross-cutting completion (notifications, scheduler, templates, deferred decisions)

**Status:** ✅ complete (2026-07-11)

### Scope
The flagged-but-deferred backlog from every prior module: the three unwired
notification events, the missing scheduled jobs, the leave↔attendance link,
the internal-communication honesty check, the unreachable-endpoint decisions,
and the `InvoiceResource` approvals array.

### 1. Notifications
- New `NotificationService` centralizes preference semantics: **email is
  opt-in** (a saved row with email=true — the default the existing
  task_assigned mail always used) and **in-app alerts are opt-out** (on
  unless a saved row disables them).
- **lead_assigned**: `LeadObserver` now sends a real email (new
  `LeadAssignedMail` + template) on assignment AND reassignment, opt-in via
  preference; its in-app alerts are gated by the in_app preference.
- **invoice_overdue**: new `invoices:mark-overdue` command (scheduled daily
  06:00) flips `sent`/`partially_paid` invoices past due date to `overdue`
  — the missing sweep flagged in the Invoicing audit (drafts/pending never
  flip; they aren't billed). Each flip alerts the invoice owner (in_app
  gated) and emails them if opted in (`InvoiceOverdueMail`). It runs BEFORE
  the pre-existing `invoices:send-reminders` (which only ever looked at
  status=overdue and therefore had been starved of new overdue invoices).
- **payment_received**: recording a payment now alerts + optionally emails
  the invoice owner (`PaymentReceivedMail`) when someone ELSE records it
  (no self-notifications).
- The Notification Settings page re-grew honestly: 6 events, an Email
  column on all of them, and an In-App column only on the three events that
  actually produce a gated alert (the other three show a dash with an
  explanatory tooltip — they are email-only events). Saved in_app values
  round-trip through the existing controller (which always persisted them).
  Alerts for other activity (quote approvals, stage changes) remain
  always-on and the guide says so.

### 2. Scheduled jobs
- Discovered during audit: recurring-invoice generation ALREADY existed and
  was scheduled (`invoices:process-recurring` — replicates the parent with
  items, correct next-date math), contrary to the earlier audit note; only
  the overdue sweep was genuinely missing (added above). Schedule is now:
  mark-overdue 06:00 → process-recurring 06:10 → send-reminders 06:20,
  plus `projects:generate-recurring-tasks` monthly on the 1st (below).
  ~~`GenerateRecurringInvoices` (an unregistered older duplicate of
  process-recurring) is flagged for deletion in the final cleanup.~~
  **CORRECTION (Module H):** not a duplicate. It generates invoices from
  `RecurringBillingRule` records (Sprint 4 rule-based billing, its own table
  + CRUD API + 4 tests), while `invoices:process-recurring` handles the
  separate invoice-level `is_recurring` flag (Sprint 9). Deleting it broke
  the Sprint 4 scheduler tests; it was restored and is now scheduled daily
  at 06:05. Do not delete either command.
- **Task templates (PRD core promise) built end-to-end.** The
  `task_templates`/`task_template_items` schema existed since Sprint 5 with
  zero API or UI. Now: `TaskTemplateController` (list for anyone with
  project visibility; create/update/delete gated on `projects.create`),
  additive migration linking `projects.task_template_id` (a recurring
  project's monthly recipe) and `tasks.task_template_id` (origin marker +
  idempotence), `POST /projects/{project}/apply-template` (projects.edit)
  creating one task per item, and the monthly command generating a linked
  template's tasks (suffixed with the month, due end-of-month) for every
  running recurring project — idempotent per calendar month. Frontend: an
  "Apply Template" action on the project Tasks tab with template preview,
  inline template creation (one task per line), and a "re-create monthly"
  option shown for retainer projects.

### 3. Leave ↔ Attendance
- Approving a leave request now creates `status='leave'` attendance records
  for every covered date. Days that already have ANY record are left
  untouched — an HR-set status or a real clock-in is never overwritten
  (the guard the Attendance audit asked for).

### 4. Internal communication (honesty check)
- Audited: **no chat UI exists anywhere** — nothing pretends to be project
  chat, team chat, or DMs, so there is nothing to remove. The AlertsDrawer
  (real, working) is the notification center. Chat is recorded here as an
  explicit Phase-Next feature. **Recommended architecture** when built:
  Laravel Reverb (already configured in `config/reverb.php` and documented
  in `.env.example`) over private channels per project/team/DM pair;
  messages persisted in a `messages` table (sender, channel type+id, body,
  read receipts), broadcast via Echo on the frontend; unread counts fold
  into the existing Alerts Center rather than a new popup system, matching
  the PRD's "no popup spam" rule.

### 5. Unreachable endpoints — decisions
- `AuthController::logoutAll` — **wired**: a "Sign out of all devices"
  section on Settings → Change Password (ConfirmModal, then revokes every
  token and returns to login). Product-wise it belongs exactly there.
- `CreditNoteController::show` — **removed** (route narrowed to
  index/store): credit notes render from the invoice context; nothing ever
  needed a single-credit-note fetch.
- `PaymentController::show` — **removed** (route narrowed to
  index/destroy): no consumer for a single-payment fetch; the stale api.ts
  wrapper deleted.
- `PaymentController::destroy` — **kept and wired**: finance correcting a
  mis-entered payment is a real need. The invoice detail's payment history
  now shows a remove action for `invoices.delete` holders, with a
  ConfirmModal explaining the balance recalculation (the Payment model's
  delete event already recalculates paid/due/status).

### 6. InvoiceResource approvals
- `InvoiceResource` now exposes `approvals` (action, actor id+name, notes,
  timestamp) when loaded; the invoice `show` endpoint loads
  `approvals.actor`. The invoice detail page's approval-history timeline —
  which had rendered "no actions logged" since the Invoicing audit —
  finally displays the real workflow trail.

### Remaining issues
- Push notifications remain unbuilt (no transport exists) — unchanged,
  honestly absent from the settings page.
- The overdue sweep and recurring generation require the scheduler cron
  (`php artisan schedule:run`) in production — called out for the README in
  the final cleanup module.
- Recurring monthly tasks are created unassigned (creator = project
  manager); auto-assignment per template item is a future refinement.

### Verification
- `php artisan test` (full suite): **214/214 passing, 981 assertions** — 7
  new tests in `Sprint19CrossCuttingTest`: the sweep flips sent→overdue but
  never drafts + alerts the owner; in_app opt-out suppresses the alert;
  payment_received alerts + emails the owner on someone else's recording
  (opt-in honored); lead-assignment email is opt-in while its alert
  defaults on; approved leave creates leave-status attendance records
  without overwriting an HR-set day; template CRUD gating + apply +
  idempotent monthly generation (4 tasks, no doubles, 8 after a month
  rolls); and the invoice approvals timeline payload. No regressions.
- `php -l` clean on all changed/added backend files; both additive
  migrations applied cleanly; `php artisan route:list` clean (task-template
  routes registered; credit-notes show and payments show gone).
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds.
- Not manually browser-tested, per this project's standing instruction.

### Next recommended module
Final production cleanup & Release Candidate 1.

## Module: Final cleanup — Release Candidate 1 (2026-07-11)

### 1. Recurring-invoice command: a cleanup near-miss, caught by the gate
- The Cross-cutting module's audit had flagged `GenerateRecurringInvoices`
  as "an unregistered older duplicate of process-recurring" and this
  module's cleanup deleted it. The final full-suite gate then failed
  210/214: the two commands are NOT duplicates.
  `creativals:generate-recurring-invoices` generates invoices from
  **`RecurringBillingRule`** records (Sprint 4 rule-based billing — own
  table, items, `next_generation_date` advancement, end-date deactivation,
  full CRUD API at `/api/v1/recurring-billing-rules`, 4 scheduler tests),
  while `invoices:process-recurring` handles the separate invoice-level
  `is_recurring` flag (Sprint 9). The command was restored from git,
  **scheduled daily at 06:05** (it had never been scheduled — the rule
  system was API-complete but dormant), and the erroneous audit note was
  corrected in place so the stale deletion flag can't be acted on again.
  Note: the rule system has no frontend UI (API-only); building one is a
  Phase-Next candidate.

### 2. Production-readiness follow-ups
- Payroll cost-allocation endpoint (`PayrollRunController::costAllocation`)
  now caches for 60 seconds, matching the reporting layer's convention —
  this was the one flagged exception in the Production Readiness audit.
- Security sweep: no hardcoded secrets/API keys in tracked files (real
  config lives in git-ignored `.env` files); `APP_DEBUG=true` appears only
  in local-default env files and the README's deploy steps require
  `APP_DEBUG=false` in production.

### 3. Status-badge consolidation
- New `frontend/src/components/ui/StatusBadge.tsx` is the single home for
  document status → badge mapping (invoice, quote, project, expense maps;
  unmapped statuses fall back to a muted badge showing the raw value).
  The Invoices list + detail, Quotes list,
  and Profitability pages now use it instead of their previously
  duplicated inline maps (flagged in the Production Readiness audit) —
  labels/classes byte-identical, so nothing visibly changes.

### 4. Deployment documentation
- New root `README.md`: local dev (`start-local.bat`, the non-negotiable
  database-safety rules, the three-step verification gate) and a full VPS
  production outline — backend env requirements, **queue worker +
  scheduler cron marked REQUIRED** (without them emails never send and
  invoices never flip overdue), Next.js build-time env warning, nginx/TLS,
  backups (including the in-app Backups & Recovery surface), first login,
  and an operations quick-reference table.
- `frontend/.env.example` documents every `NEXT_PUBLIC_*` variable,
  including the build-time inlining trap. Discovered in the process that
  frontend `.gitignore`'s `.env*` rule swallowed `.env.example` itself —
  the file the README tells deployers to copy would not exist in a fresh
  clone. Added a `!.env.example` negation and sanitized the template to
  placeholder hosts (the real deployment host stays in the git-ignored
  `.env` / `.env.local`).

### Verification
- `php artisan test` (full suite, final gate): **214/214 passing,
  981 assertions** — including the four restored Sprint 4 scheduler tests.
- `npx tsc --noEmit`: clean. `npx next build`: production build succeeds.
- Not manually browser-tested, per this project's standing instruction.

### Release Candidate 1 — known limitations / Phase Next
The application is feature-complete against the PRD's core lifecycle
(Lead → Quote → Approval → Invoice → Client → Project → Tasks → Time
Tracking → Cost Allocation → Profitability → Reporting) plus portal, AI,
payroll, and settings surfaces. Deferred items, recorded honestly:
- **Team/client chat** — unbuilt; recommended Reverb architecture recorded
  in the Cross-cutting module entry.
- **Push notifications** — no transport exists; the settings page honestly
  omits them.
- **Department profitability** — reporting is per-project/client only.
- **Packages inside quotes** — packages exist as a catalog; quote line
  items don't reference them yet.
- **Recurring billing rules UI** — backend + scheduler complete (see §1),
  no frontend surface.
- **Recurring monthly task assignment** — generated tasks are unassigned;
  per-template-item auto-assignment is a refinement.

### RC1 addendum (2026-07-11) — release decisions

- **Leaked server IP: rotate, not scrub.** The initial commit `b6a7a0b`
  (pushed to GitHub) contains the real server IP in
  `docker/nginx/oracle-cloud.conf`. Decision: treat the IP as public and
  harden/rotate the server (see README → "Server hardening") rather than
  rewrite published git history. The working tree was scrubbed in
  `a6009ff`; history is intentionally left intact.
- **Recurring rule data fix.** Seeded rule #2 ("Weekly Support Plan") had
  `tax_amount` 3600 where the correct figure is 360 (subtotal 2000 @ 18% =
  total 2360; the line item already said 360). Corrected via an Eloquent
  update on 2026-07-11 before the scheduler could copy the bad figure into
  a generated invoice. Rule #1 verified consistent (15000 + 2700 = 17700).
- **Gate at tag `v1.0.0-rc1`:** 222/222 tests, 1,028 assertions; `tsc`
  clean; `next build` green; 269 routes; 5 scheduled commands.
