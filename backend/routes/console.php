<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

use Illuminate\Support\Facades\Schedule;
// Order matters: mark overdue first so the reminder job (status = overdue)
// sees invoices that went overdue today.
Schedule::command('invoices:mark-overdue')->dailyAt('06:00');
// Two distinct recurrence systems: billing rules (recurring_billing_rules
// table, Sprint 4) and self-recurring invoices (is_recurring flag, Sprint 9).
Schedule::command('creativals:generate-recurring-invoices')->dailyAt('06:05');
Schedule::command('invoices:process-recurring')->dailyAt('06:10');
Schedule::command('invoices:send-reminders')->dailyAt('06:20');
// Recurring retainer projects get their template's tasks on the 1st.
Schedule::command('projects:generate-recurring-tasks')->monthlyOn(1, '06:30');
