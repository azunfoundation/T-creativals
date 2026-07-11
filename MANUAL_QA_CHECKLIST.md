# Manual QA Checklist — v1.0.0-rc1

Automated coverage is green (222 backend tests, `tsc`, `next build`). This
checklist covers what automation cannot see: visual rendering, real emails,
PDFs, and cross-role behaviour in a real browser.

## Setup

- [ ] Run `start-local.bat` — backend on `http://localhost:8000`, frontend on `http://localhost:3000`.
- [ ] Log in as founder. Verify the dashboard loads with KPI cards and no console errors (F12).
- [ ] Log out, log back in — session persists, no forced re-login loop.

## A. CRM (Leads)

- [ ] Create a lead with two contacts; verify it appears in the list and the stage board.
- [ ] Drag/update the lead's stage; timeline logs the change.
- [ ] Log an activity and schedule a follow-up; complete the follow-up.
- [ ] Convert the lead to a quote — lead shows "converted", quote opens in draft.

## B. Quotes

- [ ] Create a quote with an item-level discount and 18% tax; totals match a hand calculation.
- [ ] Apply a coupon code; coupon discount shows separately.
- [ ] Submit for approval → approve (status badges update at each step).
- [ ] Download the quote PDF — branding, line items, and totals render correctly.
- [ ] Send quote by email (needs SMTP configured in Settings → SMTP) — client receives it.

## C. Invoices & Payments

- [ ] Convert the approved quote to an invoice; converting it a second time is rejected.
- [ ] Mark the invoice as sent; record a partial payment — status becomes "partially paid", balance due updates.
- [ ] Pay the balance — status "paid", balance 0.
- [ ] Overpayment attempt is rejected with a clear message.
- [ ] Download the invoice PDF; email it to the client.
- [ ] Create a credit note; amount above invoice total is rejected.
- [ ] Create a recurring billing rule (monthly). Run `php artisan creativals:generate-recurring-invoices --dry-run` and confirm it reports the rule without creating an invoice; run it without `--dry-run` and confirm the draft invoice appears.

## D. Projects, Tasks & Timesheets

- [ ] Create a project for the client; add a team member.
- [ ] Add tasks manually and via a task template (Apply Template).
- [ ] Log a timesheet entry against a task; approve it under Timesheets → Approvals.
- [ ] Project profitability page shows revenue vs. cost for the project.

## E. Payroll & Expenses

- [ ] Create a payroll run for the current month; payslip amounts match employee salary setup.
- [ ] Record an overhead expense; it appears in the expense list and profitability report.
- [ ] Apply for leave as an employee; approve it as founder.

## F. Reports

- [ ] Profitability report loads with real numbers (no NaN/blank cells).
- [ ] Quote conversion report reflects the lead you converted in section A.
- [ ] Payroll summary matches the payroll run from section E.

## G. Users, Roles & Permissions

- [ ] Create a new employee user; they can log in with the set password.
- [ ] Assign a restricted role (e.g. `employee`) — verify they CANNOT see Payroll, Users, or Settings in the sidebar, and direct URLs (e.g. `/users`) are blocked.
- [ ] Change password flow works and the old password stops working.

## H. AI Assistant & Automations

- [ ] AI page shows "Simulation mode" banner when no `GEMINI_API_KEY` is set; with a key, live responses work.
- [ ] Create an automation; trigger its event (e.g. new lead) and verify the run is logged on the automations page.
- [ ] Set `NEXT_PUBLIC_AI_ENABLED=false`, rebuild, and confirm every AI entry point disappears.

## Client Portal

- [ ] Log in as a portal client — only portal pages are reachable; dashboard URLs redirect/403.
- [ ] Client sees ONLY their own invoices, quotes, and projects (spot-check against a second client's data).
- [ ] Client can download their invoice PDF.

## Notifications & Email

- [ ] Recording a payment notifies the invoice owner (bell icon + email if enabled).
- [ ] Assigning a lead emails the sales exec.
- [ ] Notification preferences page: disable an email type and confirm the email is suppressed while the in-app notification still arrives.

## Scheduler (run once manually)

- [ ] `php artisan invoices:mark-overdue` — past-due sent invoices flip to "overdue".
- [ ] `php artisan invoices:process-recurring --dry-run` — reports due recurring invoices, writes nothing.
- [ ] `php artisan schedule:list` — shows the 5 expected entries with sensible times.

## Cross-cutting

- [ ] Hard refresh (Ctrl+F5) on a deep page (e.g. `/invoices/1`) — no 404, data loads.
- [ ] Browser back/forward navigation doesn't break state.
- [ ] Currency amounts formatted consistently (₹, two decimals) across list, detail, and PDF views.
- [ ] No stray console errors while walking the flows above.
