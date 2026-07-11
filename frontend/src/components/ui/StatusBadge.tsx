'use client';

import React from 'react';

/**
 * The single home for document status → badge mapping. The same maps were
 * previously duplicated inline on the Invoices, Quotes, and Profitability
 * pages (flagged in the Production Readiness audit) — consolidated here with
 * byte-identical labels/classes so nothing visibly changes.
 */

type BadgeConfig = { label: string; className: string };

const INVOICE_BADGES: Record<string, BadgeConfig> = {
  draft: { label: 'Draft', className: 'badge-muted' },
  pending_review: { label: 'Pending Review', className: 'badge-warning' },
  pending_approval: { label: 'Pending Approval', className: 'badge-warning' },
  approved: { label: 'Approved', className: 'badge-accent' },
  sent: { label: 'Sent', className: 'badge-info' },
  partially_paid: { label: 'Partially Paid', className: 'badge-warning' },
  paid: { label: 'Paid', className: 'badge-success' },
  overdue: { label: 'Overdue', className: 'badge-danger' },
  void: { label: 'Void', className: 'badge-muted' },
  cancelled: { label: 'Cancelled', className: 'badge-muted' },
};

const QUOTE_BADGES: Record<string, BadgeConfig> = {
  draft: { label: 'Draft', className: 'badge-muted' },
  pending_approval: { label: 'Pending Approval', className: 'badge-warning' },
  approved: { label: 'Approved', className: 'badge-success' },
  sent: { label: 'Sent', className: 'badge-info' },
  accepted: { label: 'Accepted', className: 'badge-accent' },
  rejected: { label: 'Rejected', className: 'badge-danger' },
  expired: { label: 'Expired', className: 'badge-muted' },
  converted: { label: 'Converted', className: 'badge-success' },
};

const PROJECT_BADGES: Record<string, BadgeConfig> = {
  planning: { label: 'Planning', className: 'badge-info' },
  in_progress: { label: 'In Progress', className: 'badge-accent' },
  active: { label: 'Active', className: 'badge-accent' },
  on_hold: { label: 'On Hold', className: 'badge-warning' },
  completed: { label: 'Completed', className: 'badge-success' },
  cancelled: { label: 'Cancelled', className: 'badge-danger' },
};

const EXPENSE_BADGES: Record<string, BadgeConfig> = {
  draft: { label: 'Draft', className: 'badge-muted' },
  submitted: { label: 'Submitted', className: 'badge-warning' },
  approved: { label: 'Approved', className: 'badge-info' },
  rejected: { label: 'Rejected', className: 'badge-danger' },
  reimbursed: { label: 'Reimbursed', className: 'badge-success' },
};

const MAPS = {
  invoice: INVOICE_BADGES,
  quote: QUOTE_BADGES,
  project: PROJECT_BADGES,
  expense: EXPENSE_BADGES,
} as const;

export type StatusBadgeKind = keyof typeof MAPS;

export function statusBadgeConfig(kind: StatusBadgeKind, status: string): BadgeConfig {
  return MAPS[kind][status] || { label: status, className: 'badge-muted' };
}

export function StatusBadge({ kind, status }: { kind: StatusBadgeKind; status: string }) {
  const config = statusBadgeConfig(kind, status);
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
