import React from 'react';

export const truncate = (str: string, n: number) =>
  str && str.length > n ? str.slice(0, n - 1) + '…' : str;

/** Coerce a value that should be an array but may arrive as an object with
 *  numeric keys (Laravel Collection serialised via JSON).  */
export const toArr = (v: unknown): any[] =>
  Array.isArray(v) ? v : v != null && typeof v === 'object' ? Object.values(v) : [];

export interface KpiCard {
  label: string;
  value: string | number;
  trend: 'up' | 'down' | 'flat';
  badge: string;
  sub: string;
  icon: React.ElementType;
  color: string;
  help: string;
  sparklineData?: number[];
}

export const DASHBOARD_HOWTO = {
  overview: 'The dashboard is your daily starting point. Every number here is calculated live from your invoices, expenses, projects, tasks, and leads — nothing is edited on this page; you fix data in the module it came from. What you see depends on your role: finance figures appear only for people allowed to see company money, sales figures for the sales team, and everyone gets their own "My Day" summary.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Start each morning with "My Day" (your own tasks, hours, and clock-in status) and the "Attention Required" panel — it lists only the overdue items you can actually act on.',
        'Scan the KPI cards for this month\'s numbers. Cards you don\'t see are ones your role doesn\'t cover — that\'s intentional, not missing data.',
        'Use the quick-action buttons at the top right to jump straight to creating a record. Only actions your role can perform are shown.',
        'Click any row in Attention Required or Project Health to open the related record and act on it.',
      ],
    },
    {
      heading: 'Reading the numbers',
      items: [
        'Revenue is what was invoiced this month; "Collections" in the chart is what clients actually paid. They are different on purpose.',
        'Net Profit = Revenue − approved Expenses − Payroll cost for the month, matching the Margins table exactly.',
        'The Financial Cash Flow chart shows 6 real months of history — the small sparklines on the Revenue and Net Profit cards come from the same data.',
        'Sales Pipeline counts are the CURRENT open pipeline (all time), while "New Leads" and "Conversion Rate" cover this month only — each label\'s ⓘ says which.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Check the dashboard first thing daily and clear alerts before starting new work.',
        'If Outstanding keeps growing, follow up the invoices under the "Pay" tab in Attention Required.',
        'Watch the Risk column in Project Health — anything "critical" deserves a conversation with the project manager today.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Reading Revenue as cash in the bank — Revenue is what was invoiced; "Collections" in the chart is what actually came in.',
        'Ignoring the alert count — items stay overdue until someone fixes them in their own module (Invoices, Tasks, Projects, CRM).',
        'Trying to edit figures here — the dashboard is read-only; update the source record instead.',
      ],
    },
  ],
};
