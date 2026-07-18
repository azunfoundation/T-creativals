'use client';

import { useState } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotes as quotesApi } from '@/lib/api';
import type { Quote } from '@/lib/api';
import { 
  Plus, Search, FileText, ChevronLeft, ChevronRight, Eye, Calendar, DollarSign, 
  Check, X, ShieldAlert, Edit2, RotateCcw, Filter, FileCheck2, Clock, Hourglass, 
  HelpCircle, MoreVertical, ArrowUpRight, CheckCircle2, AlertCircle, FileQuestion, ArrowRight, Trash2
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuthStore } from '@/store/auth';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';

const QUOTES_HOWTO = {
  overview: 'A Quote is a priced proposal you send to a lead or client before any work starts — it lists the services, quantities, discounts, and taxes, and adds up to the amount you are asking them to approve. Once a client says yes, the quote becomes the basis for an invoice and, later, a project.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Create Quote" to open the quote builder and save your proposal as a Draft.',
        'A Draft must go through internal review: open it and click "Submit for Approval" so a Founder or Sales Head can approve the pricing.',
        'Once Approved, email the quote to the client from its detail page, then convert it to an invoice when they accept.',
        'Use the search box (quote #, client, or title) and the status dropdown to find a specific quote in the list.',
      ],
    },
    {
      heading: 'Status lifecycle',
      items: [
        'Draft — still being written; only Draft and Rejected quotes can be edited.',
        'Pending Approval — waiting for a Founder or Sales Head to sign off internally.',
        'Approved / Sent — pricing signed off; Sent means it has been emailed to the client.',
        'Accepted / Rejected — the client agreed, or an approver sent it back with comments for rework.',
        'Expired / Converted — the "Valid Until" date passed, or the quote was turned into an invoice.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Set a realistic "Valid Until" date — quotes past that date show as Expired and should be re-issued, not resent.',
        'Keep quote titles descriptive (e.g. "Website Redesign & SEO Campaign") so they are easy to find later.',
        'Convert an accepted quote to an invoice promptly so billing matches what the client agreed to.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Emailing a quote to the client before it has been approved internally.',
        'Editing prices verbally with the client but never updating the quote — the invoice is built from the quote, so keep it accurate.',
        'Letting quotes sit until they expire instead of following up while they are still valid.',
      ],
    },
  ],
};

// ── Fallback 24 Mock Quotes matching the screenshot proportions ─────────────────
const MOCK_QUOTES: Quote[] = [
  {
    id: 5,
    quote_number: 'QT-2026-0005',
    lead_id: 7,
    lead: { id: 7, company_name: 'mra', budget: 5000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-14T06:00:00Z', updated_at: '2026-07-14T10:00:00Z' },
    title: 'websi',
    currency: 'INR',
    valid_until: '2026-08-09',
    status: 'converted',
    subtotal: 3500,
    discount_amount: 0,
    tax_amount: 630,
    total_amount: 4130,
    items: [],
    created_at: '2026-07-14T06:00:00Z',
    updated_at: '2026-07-14T10:00:00Z',
  },
  {
    id: 4,
    quote_number: 'QT-2026-0004',
    lead_id: 5,
    lead: { id: 5, company_name: 'basit bhai', budget: 1500, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-14T01:00:00Z', updated_at: '2026-07-14T07:00:00Z' },
    title: 'basit bhai - Brand & Web Strategy Proposal',
    currency: 'INR',
    valid_until: '2026-08-08',
    status: 'draft',
    subtotal: 1017,
    discount_amount: 0,
    tax_amount: 183,
    total_amount: 1200,
    items: [],
    created_at: '2026-07-14T01:00:00Z',
    updated_at: '2026-07-14T07:00:00Z',
  },
  {
    id: 3,
    quote_number: 'QT-2026-0003',
    lead_id: 1,
    lead: { id: 1, company_name: 'Acme Corp', budget: 100000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-13T10:00:00Z', updated_at: '2026-07-13T12:00:00Z' },
    title: 'Acme Corp - Brand & Web Strategy Proposal',
    currency: 'INR',
    valid_until: '2026-08-08',
    status: 'draft',
    subtotal: 80000,
    discount_amount: 0,
    tax_amount: 14400,
    total_amount: 94400,
    items: [],
    created_at: '2026-07-13T10:00:00Z',
    updated_at: '2026-07-13T12:00:00Z',
  },
  {
    id: 2,
    quote_number: 'QT-2026-0002',
    lead_id: 5,
    lead: { id: 5, company_name: 'basit bhai', budget: 4000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-13T09:00:00Z', updated_at: '2026-07-13T11:00:00Z' },
    title: 'asfasdfas',
    currency: 'INR',
    valid_until: '2026-08-08',
    status: 'approved',
    subtotal: 3000,
    discount_amount: 0,
    tax_amount: 540,
    total_amount: 3540,
    items: [],
    created_at: '2026-07-13T09:00:00Z',
    updated_at: '2026-07-13T11:00:00Z',
  },
  {
    id: 1,
    quote_number: 'QUO-2026-0001',
    lead_id: 1,
    lead: { id: 1, company_name: 'Acme Corp', budget: 200000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-12T08:00:00Z', updated_at: '2026-07-12T10:00:00Z' },
    title: 'Website Redesign Proposal',
    currency: 'INR',
    valid_until: '2026-08-07',
    status: 'draft',
    subtotal: 150000,
    discount_amount: 0,
    tax_amount: 27000,
    total_amount: 177000,
    items: [],
    created_at: '2026-07-12T08:00:00Z',
    updated_at: '2026-07-12T10:00:00Z',
  },
  {
    id: 6,
    quote_number: 'QUO-2026-0002',
    lead_id: 1,
    lead: { id: 1, company_name: 'Acme Corp', budget: 80000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-12T07:00:00Z', updated_at: '2026-07-12T09:00:00Z' },
    title: 'SEO & Content Campaign',
    currency: 'INR',
    valid_until: '2026-08-07',
    status: 'approved',
    subtotal: 60000,
    discount_amount: 0,
    tax_amount: 10800,
    total_amount: 70800,
    items: [],
    created_at: '2026-07-12T07:00:00Z',
    updated_at: '2026-07-12T09:00:00Z',
  },
  // Remaining items to complete 24 quotes (9 converted, 10 draft/approved/sent, 5 expired)
  {
    id: 7,
    quote_number: 'QT-2026-0007',
    lead_id: 2,
    lead: { id: 2, company_name: 'NovaTech Corp', budget: 20000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-11T12:00:00Z', updated_at: '2026-07-12T14:00:00Z' },
    title: 'Cloud Migration Strategy',
    currency: 'INR',
    valid_until: '2026-08-05',
    status: 'converted',
    subtotal: 15000,
    discount_amount: 0,
    tax_amount: 2700,
    total_amount: 17700,
    items: [],
    created_at: '2026-07-11T12:00:00Z',
    updated_at: '2026-07-12T14:00:00Z',
  },
  {
    id: 8,
    quote_number: 'QT-2026-0008',
    lead_id: 3,
    lead: { id: 3, company_name: 'Starlight Retail', budget: 35000, priority: 'low', temperature: 'cold', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-10T10:00:00Z', updated_at: '2026-07-11T11:00:00Z' },
    title: 'E-commerce Brand Identity Pack',
    currency: 'INR',
    valid_until: '2026-08-04',
    status: 'converted',
    subtotal: 30000,
    discount_amount: 0,
    tax_amount: 5400,
    total_amount: 35400,
    items: [],
    created_at: '2026-07-10T10:00:00Z',
    updated_at: '2026-07-11T11:00:00Z',
  },
  {
    id: 9,
    quote_number: 'QT-2026-0009',
    lead_id: 4,
    lead: { id: 4, company_name: 'EduPath', budget: 15000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-09T09:00:00Z', updated_at: '2026-07-10T08:00:00Z' },
    title: 'Content Strategy Roadmap',
    currency: 'INR',
    valid_until: '2026-08-02',
    status: 'converted',
    subtotal: 10000,
    discount_amount: 0,
    tax_amount: 1800,
    total_amount: 11800,
    items: [],
    created_at: '2026-07-09T09:00:00Z',
    updated_at: '2026-07-10T08:00:00Z',
  },
  {
    id: 10,
    quote_number: 'QT-2026-0010',
    lead_id: 6,
    lead: { id: 6, company_name: 'Apex Group', budget: 60000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-08T08:00:00Z', updated_at: '2026-07-09T14:00:00Z' },
    title: 'Performance Marketing Setup',
    currency: 'INR',
    valid_until: '2026-08-01',
    status: 'converted',
    subtotal: 50000,
    discount_amount: 5000,
    tax_amount: 8100,
    total_amount: 53100,
    items: [],
    created_at: '2026-07-08T08:00:00Z',
    updated_at: '2026-07-09T14:00:00Z',
  },
  {
    id: 11,
    quote_number: 'QT-2026-0011',
    lead_id: 8,
    lead: { id: 8, company_name: 'Alpha Dynamics', budget: 90000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-07T11:00:00Z', updated_at: '2026-07-08T12:00:00Z' },
    title: 'Custom ERP Wireframing',
    currency: 'INR',
    valid_until: '2026-07-31',
    status: 'converted',
    subtotal: 80000,
    discount_amount: 0,
    tax_amount: 14400,
    total_amount: 94400,
    items: [],
    created_at: '2026-07-07T11:00:00Z',
    updated_at: '2026-07-08T12:00:00Z',
  },
  {
    id: 12,
    quote_number: 'QT-2026-0012',
    lead_id: 9,
    lead: { id: 9, company_name: 'Solace Tech', budget: 12000, priority: 'low', temperature: 'cold', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-06T10:00:00Z', updated_at: '2026-07-07T10:00:00Z' },
    title: 'Landing Page Optimization',
    currency: 'INR',
    valid_until: '2026-07-30',
    status: 'converted',
    subtotal: 10000,
    discount_amount: 1000,
    tax_amount: 1620,
    total_amount: 10620,
    items: [],
    created_at: '2026-07-06T10:00:00Z',
    updated_at: '2026-07-07T10:00:00Z',
  },
  {
    id: 13,
    quote_number: 'QT-2026-0013',
    lead_id: 10,
    lead: { id: 10, company_name: 'Vivid Studio', budget: 25000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-05T09:00:00Z', updated_at: '2026-07-06T13:00:00Z' },
    title: 'Brand Explainer Animation',
    currency: 'INR',
    valid_until: '2026-07-28',
    status: 'converted',
    subtotal: 20000,
    discount_amount: 0,
    tax_amount: 3600,
    total_amount: 23600,
    items: [],
    created_at: '2026-07-05T09:00:00Z',
    updated_at: '2026-07-06T13:00:00Z',
  },
  {
    id: 14,
    quote_number: 'QT-2026-0014',
    lead_id: 11,
    lead: { id: 11, company_name: 'Nexus Logi', budget: 45000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-04T08:00:00Z', updated_at: '2026-07-05T15:00:00Z' },
    title: 'Supply Chain Audit',
    currency: 'INR',
    valid_until: '2026-07-25',
    status: 'converted',
    subtotal: 40000,
    discount_amount: 2000,
    tax_amount: 6840,
    total_amount: 44840,
    items: [],
    created_at: '2026-07-04T08:00:00Z',
    updated_at: '2026-07-05T15:00:00Z',
  },
  // Draft / Approved / Sent items (Need 10 total; we have ids 4, 3, 1, 2, 6. We need 5 more)
  {
    id: 15,
    quote_number: 'QT-2026-0015',
    lead_id: 2,
    lead: { id: 2, company_name: 'NovaTech Corp', budget: 30000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-03T11:00:00Z', updated_at: '2026-07-03T11:00:00Z' },
    title: 'Mobile App Wireframes',
    currency: 'INR',
    valid_until: '2026-08-15',
    status: 'draft',
    subtotal: 25000,
    discount_amount: 0,
    tax_amount: 4500,
    total_amount: 29500,
    items: [],
    created_at: '2026-07-03T11:00:00Z',
    updated_at: '2026-07-03T11:00:00Z',
  },
  {
    id: 16,
    quote_number: 'QT-2026-0016',
    lead_id: 3,
    lead: { id: 3, company_name: 'Starlight Retail', budget: 15000, priority: 'low', temperature: 'cold', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-02T10:00:00Z', updated_at: '2026-07-02T10:00:00Z' },
    title: 'SEO Audit Baseline',
    currency: 'INR',
    valid_until: '2026-08-10',
    status: 'draft',
    subtotal: 10000,
    discount_amount: 0,
    tax_amount: 1800,
    total_amount: 11800,
    items: [],
    created_at: '2026-07-02T10:00:00Z',
    updated_at: '2026-07-02T10:00:00Z',
  },
  {
    id: 17,
    quote_number: 'QT-2026-0017',
    lead_id: 4,
    lead: { id: 4, company_name: 'EduPath', budget: 8000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-07-01T09:00:00Z', updated_at: '2026-07-01T09:00:00Z' },
    title: 'Newsletter Template Setup',
    currency: 'INR',
    valid_until: '2026-08-05',
    status: 'draft',
    subtotal: 6000,
    discount_amount: 500,
    tax_amount: 990,
    total_amount: 6490,
    items: [],
    created_at: '2026-07-01T09:00:00Z',
    updated_at: '2026-07-01T09:00:00Z',
  },
  {
    id: 18,
    quote_number: 'QT-2026-0018',
    lead_id: 6,
    lead: { id: 6, company_name: 'Apex Group', budget: 120000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-06-30T08:00:00Z', updated_at: '2026-06-30T10:00:00Z' },
    title: 'CRM Setup & Training',
    currency: 'INR',
    valid_until: '2026-07-30',
    status: 'approved',
    subtotal: 100000,
    discount_amount: 0,
    tax_amount: 18000,
    total_amount: 118000,
    items: [],
    created_at: '2026-06-30T08:00:00Z',
    updated_at: '2026-06-30T10:00:00Z',
  },
  {
    id: 19,
    quote_number: 'QT-2026-0019',
    lead_id: 8,
    lead: { id: 8, company_name: 'Alpha Dynamics', budget: 50000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-06-29T11:00:00Z', updated_at: '2026-06-29T11:00:00Z' },
    title: 'Database Schema Audit',
    currency: 'INR',
    valid_until: '2026-07-28',
    status: 'draft',
    subtotal: 40000,
    discount_amount: 0,
    tax_amount: 7200,
    total_amount: 47200,
    items: [],
    created_at: '2026-06-29T11:00:00Z',
    updated_at: '2026-06-29T11:00:00Z',
  },
  // Expired items (Need 5 total)
  {
    id: 20,
    quote_number: 'QT-2026-0020',
    lead_id: 9,
    lead: { id: 9, company_name: 'Solace Tech', budget: 15000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-05-10T10:00:00Z', updated_at: '2026-05-15T12:00:00Z' },
    title: 'Social Ads Campaign setup',
    currency: 'INR',
    valid_until: '2026-06-10',
    status: 'expired',
    subtotal: 12000,
    discount_amount: 0,
    tax_amount: 2160,
    total_amount: 14160,
    items: [],
    created_at: '2026-05-10T10:00:00Z',
    updated_at: '2026-05-15T12:00:00Z',
  },
  {
    id: 21,
    quote_number: 'QT-2026-0021',
    lead_id: 10,
    lead: { id: 10, company_name: 'Vivid Studio', budget: 30000, priority: 'low', temperature: 'cold', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-05-08T09:00:00Z', updated_at: '2026-05-12T10:00:00Z' },
    title: 'Poster & Banner Design Collateral',
    currency: 'INR',
    valid_until: '2026-06-08',
    status: 'expired',
    subtotal: 25000,
    discount_amount: 2000,
    tax_amount: 4140,
    total_amount: 27140,
    items: [],
    created_at: '2026-05-08T09:00:00Z',
    updated_at: '2026-05-12T10:00:00Z',
  },
  {
    id: 22,
    quote_number: 'QT-2026-0022',
    lead_id: 11,
    lead: { id: 11, company_name: 'Nexus Logi', budget: 10000, priority: 'low', temperature: 'cold', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-05-05T08:00:00Z', updated_at: '2026-05-10T09:00:00Z' },
    title: 'Website Link Audit',
    currency: 'INR',
    valid_until: '2026-06-05',
    status: 'expired',
    subtotal: 8000,
    discount_amount: 0,
    tax_amount: 1440,
    total_amount: 9440,
    items: [],
    created_at: '2026-05-05T08:00:00Z',
    updated_at: '2026-05-10T09:00:00Z',
  },
  {
    id: 23,
    quote_number: 'QT-2026-0023',
    lead_id: 5,
    lead: { id: 5, company_name: 'basit bhai', budget: 20000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-04-20T09:00:00Z', updated_at: '2026-04-25T11:00:00Z' },
    title: 'Old Branding Package Proposal',
    currency: 'INR',
    valid_until: '2026-05-20',
    status: 'expired',
    subtotal: 18000,
    discount_amount: 0,
    tax_amount: 3240,
    total_amount: 21240,
    items: [],
    created_at: '2026-04-20T09:00:00Z',
    updated_at: '2026-04-25T11:00:00Z',
  },
  {
    id: 24,
    quote_number: 'QT-2026-0024',
    lead_id: 1,
    lead: { id: 1, company_name: 'Acme Corp', budget: 60000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '2026-04-10T10:00:00Z', updated_at: '2026-04-15T12:00:00Z' },
    title: 'Content Translation Proposal',
    currency: 'INR',
    valid_until: '2026-05-10',
    status: 'expired',
    subtotal: 50000,
    discount_amount: 5000,
    tax_amount: 8100,
    total_amount: 53100,
    items: [],
    created_at: '2026-04-10T10:00:00Z',
    updated_at: '2026-04-15T12:00:00Z',
  }
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'converted', label: 'Converted' },
];

const TIME_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
];

// SVG Donut Chart helper
function DonutChart({ converted = 0, draft = 0, expired = 0 }: { converted: number; draft: number; expired: number }) {
  const total = converted + draft + expired;
  if (total === 0) return null;

  const data = [
    { name: 'Converted', value: converted, color: 'var(--success)' },
    { name: 'Draft', value: draft, color: 'var(--info)' },
    { name: 'Expired', value: expired, color: 'var(--warning)' },
  ];

  const radius = 35;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius; // ~219.91
  
  let currentOffset = 0;

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
      {data.map((item, idx) => {
        const percentage = item.value / total;
        const strokeLength = circumference * percentage;
        const strokeOffset = circumference - strokeLength + currentOffset;
        currentOffset -= strokeLength;

        return (
          <circle
            key={idx}
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke={item.color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dashoffset var(--transition-slow)' }}
          />
        );
      })}
    </svg>
  );
}

export default function QuotesPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuoteMenuId, setActiveQuoteMenuId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, prompt } = useModal();
  const { user } = useAuthStore();

  const userRoles = user?.roles.map((r: any) => typeof r === 'string' ? r : r?.name || '') || [];
  const isApprover = userRoles.includes('founder') || userRoles.includes('director') || userRoles.includes('sales_head');

  // Submit Approval Mutation
  const submitApprovalMutation = useMutation({
    mutationFn: (id: number) => quotesApi.submitApproval(id),
    onSuccess: () => {
      showToast('Quote submitted for internal approval successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setActiveQuoteMenuId(null);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to submit quote.', 'error');
    }
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: ({ id, comments }: { id: number, comments?: string }) => quotesApi.approve(id, comments),
    onSuccess: () => {
      showToast('Quote approved successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setActiveQuoteMenuId(null);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to approve quote.', 'error');
    }
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, comments }: { id: number, comments?: string }) => quotesApi.reject(id, comments),
    onSuccess: () => {
      showToast('Quote rejected successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setActiveQuoteMenuId(null);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to reject quote.', 'error');
    }
  });

  // Send Mutation (Mark as Sent)
  const sendMutation = useMutation({
    mutationFn: (id: number) => quotesApi.send(id),
    onSuccess: () => {
      showToast('Quote marked as sent and email queued.', 'success');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setActiveQuoteMenuId(null);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to mark quote as sent.', 'error');
    }
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => quotesApi.delete(id),
    onSuccess: () => {
      showToast('Quote deleted successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setActiveQuoteMenuId(null);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to delete quote.', 'error');
    }
  });

  // Download PDF handler
  const handleDownloadPdf = async (quote: Quote) => {
    try {
      showToast('Generating PDF...', 'info');
      setActiveQuoteMenuId(null);
      const res = await quotesApi.downloadPdf(quote.id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quote-${quote.quote_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast('PDF downloaded successfully.', 'success');
    } catch {
      showToast('Failed to download PDF.', 'error');
    }
  };

  // Fetch Quotes - fetch a large list to do global stats calculations, filters and pagination client-side.
  // This guarantees that all charts, KPIs, sidebar activities and numbers stay 100% in sync perfectly.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['quotes', 'all-list'],
    queryFn: async () => {
      const res = await quotesApi.list({
        per_page: 1000,
      });
      return res.data;
    }
  });

  const rawQuotes = data?.data || [];

  // Filter helper functions
  const filterByDateRange = (quote: Quote, range: string) => {
    if (range === 'all') return true;
    
    const date = new Date(quote.created_at || new Date());
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
      case 'today':
        return date >= startOfToday;
      case 'this_week': {
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
        return date >= startOfWeek;
      }
      case 'this_month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return date >= startOfMonth;
      }
      case 'this_quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
        return date >= startOfQuarter;
      }
      case 'this_year': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return date >= startOfYear;
      }
      default:
        return true;
    }
  };

  // Perform Client-Side filtering to keep stats and table in absolute sync
  const filteredQuotes = rawQuotes.filter(quote => {
    // Status Filter
    if (statusFilter !== 'all') {
      if (quote.status !== statusFilter) return false;
    }

    // Time Filter
    if (!filterByDateRange(quote, timeFilter)) return false;

    // Search Query Filter
    if (searchQuery) {
      const qNum = quote.quote_number.toLowerCase();
      const qTitle = quote.title.toLowerCase();
      const clientName = (quote.lead?.company_name || quote.client?.name || '').toLowerCase();
      const search = searchQuery.toLowerCase();
      if (!qNum.includes(search) && !qTitle.includes(search) && !clientName.includes(search)) {
        return false;
      }
    }

    return true;
  });

  // KPI calculations based on the total unfiltered quotes (all time pipeline stats)
  const totalQuotesCount = rawQuotes.length;
  
  const totalValue = rawQuotes.reduce((sum, q) => sum + (Number(q.total_amount) || 0), 0);

  // Groupings for KPI metrics
  const convertedCount = rawQuotes.filter(q => q.status === 'converted').length;
  const draftCount = rawQuotes.filter(q => q.status === 'draft').length;
  const expiredCount = rawQuotes.filter(q => q.status === 'expired').length;

  const convertedPct = totalQuotesCount > 0 ? (convertedCount / totalQuotesCount) * 100 : 0;
  const draftPct = totalQuotesCount > 0 ? (draftCount / totalQuotesCount) * 100 : 0;
  const expiredPct = totalQuotesCount > 0 ? (expiredCount / totalQuotesCount) * 100 : 0;
  
  const conversionRate = totalQuotesCount > 0 ? (convertedCount / totalQuotesCount) * 100 : 0;

  // Pagination Math
  const totalFiltered = filteredQuotes.length;
  const lastPage = Math.ceil(totalFiltered / perPage) || 1;
  const currentPage = Math.min(page, lastPage);
  
  const paginatedQuotes = filteredQuotes.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  // Reset Filters Handler
  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTimeFilter('all');
    setPage(1);
  };

  // Status badges mapping kind
  const getStatusBadge = (status: Quote['status']) => <StatusBadge kind="quote" status={status} />;

  // Build Recent Activity Feed dynamically from status updates of quotes
  const activityLog = rawQuotes
    .slice()
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 4)
    .map((q, idx) => {
      let iconColor = 'bg-success/10 text-success border-success/20';
      let IconComponent = CheckCircle2;
      let actionText = 'converted';

      if (q.status === 'draft') {
        iconColor = 'bg-info/10 text-info border-info/20';
        IconComponent = FileText;
        actionText = 'created';
      } else if (q.status === 'expired') {
        iconColor = 'bg-warning/10 text-warning border-warning/20';
        IconComponent = Clock;
        actionText = 'expired';
      } else if (q.status === 'approved') {
        iconColor = 'bg-success/10 text-success border-success/20';
        IconComponent = CheckCircle2;
        actionText = 'approved';
      } else if (q.status === 'rejected') {
        iconColor = 'bg-danger/10 text-danger border-danger/20';
        IconComponent = AlertCircle;
        actionText = 'rejected';
      } else {
        iconColor = 'bg-muted/10 text-secondary border-border';
        IconComponent = FileQuestion;
        actionText = `updated to ${q.status}`;
      }

      return {
        id: q.id + '-' + idx,
        quoteNumber: q.quote_number,
        message: `Quote ${q.quote_number} ${actionText}`,
        time: formatRelativeTime(q.updated_at || q.created_at),
        Icon: IconComponent,
        classColors: iconColor
      };
    });

  return (
    <div style={{ maxWidth: '1480px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <FileText className="text-accent" size={26} />
            Quotations
            <HelpIcon title="Quotations" content={{
              what: 'A quote is a priced proposal listing services, discounts, and taxes that you send to a lead or client for approval.',
              why: 'It locks in scope and pricing in writing before work begins, and becomes the basis for the invoice once the client accepts.',
              when: 'Create one whenever a lead or client asks for pricing — get it approved internally, email it, then convert it to an invoice on acceptance.',
            }} />
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Create, build, track approvals, and manage client-facing product and pricing estimates.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <HowToUseGuide moduleKey="quotes" title="How Quotes Work" content={QUOTES_HOWTO} />
          <Link href="/quotes/create" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent)' }}>
            <Plus size={16} /> Create Quote
          </Link>
        </div>
      </div>

      {/* ── KPI Row (Grid of 7 Columns) ── */}
      {isError ? (
        <div className="card text-center p-6 text-danger shadow-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-subtle)' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
          <p className="font-semibold text-sm">Failed to load quotes summary. Please make sure the backend is running and try again.</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-4">
          {/* Total Quotes */}
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="kpi-label">Total Quotes</span>
              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={16} className="text-accent" />
              </div>
            </div>
            <span className="kpi-value" style={{ marginTop: '0.5rem' }}>{totalQuotesCount}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>All time</span>
          </div>

          {/* Total Value */}
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="kpi-label">Total Value</span>
              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--info-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={16} className="text-info" />
              </div>
            </div>
            <span className="kpi-value" style={{ marginTop: '0.5rem' }}>{formatCurrency(totalValue)}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>All time</span>
          </div>

          {/* Converted */}
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="kpi-label">Converted</span>
              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--success-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={16} className="text-success" />
              </div>
            </div>
            <span className="kpi-value" style={{ marginTop: '0.5rem' }}>{convertedCount}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{convertedPct.toFixed(1)}% of total</span>
          </div>

          {/* Draft */}
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="kpi-label">Draft</span>
              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--info-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Hourglass size={14} className="text-info" />
              </div>
            </div>
            <span className="kpi-value" style={{ marginTop: '0.5rem' }}>{draftCount}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{draftPct.toFixed(1)}% of total</span>
          </div>

          {/* Expired */}
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="kpi-label">Expired</span>
              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--warning-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={16} className="text-warning" />
              </div>
            </div>
            <span className="kpi-value" style={{ marginTop: '0.5rem' }}>{expiredCount}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{expiredPct.toFixed(1)}% of total</span>
          </div>

          {/* Conversion Rate Sparkline (Spans 2 columns) */}
          <div className="kpi-card col-span-1 sm:col-span-2 lg:col-span-2" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Conversion Rate</span>
              <span className="kpi-value" style={{ marginTop: '0.5rem', color: 'var(--accent)' }}>{conversionRate.toFixed(1)}%</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px', marginTop: '0.25rem' }}>
                +12.5% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs last month</span>
              </span>
            </div>
            {/* Sparkline curve */}
            <div style={{ width: '120px', height: '55px', opacity: 0.9 }}>
              <svg width="100%" height="100%" viewBox="0 0 120 50" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="purpleGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0 35 Q 20 40, 40 25 T 80 15 T 120 8"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 0 35 Q 20 40, 40 25 T 80 15 T 120 8 L 120 50 L 0 50 Z"
                  fill="url(#purpleGlow)"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── Filter & Search Bar ── */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: 'var(--surface)', padding: '0.875rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        {/* Search Box */}
        <div style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '420px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by quote #, client, or title..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="form-input"
            style={{ paddingLeft: '2.5rem', width: '100%', height: '40px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          />
        </div>

        {/* Filters Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="form-input"
            style={{ width: '150px', height: '40px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 0.75rem' }}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Time Filter */}
          <select
            value={timeFilter}
            onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}
            className="form-input"
            style={{ width: '150px', height: '40px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 0.75rem' }}
          >
            {TIME_FILTERS.map((tf) => (
              <option key={tf.value} value={tf.value}>{tf.label}</option>
            ))}
          </select>

          {/* Filters toggle */}
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '40px', border: '1px solid var(--border)', background: 'var(--surface-elevated)' }}>
            <Filter size={14} /> Filters
          </button>

          {/* Reset Filters */}
          <button 
            onClick={handleResetFilters}
            className="btn btn-ghost" 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: 0 }}
            title="Reset Filters"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* ── Main content grid (Table left, Sidebar right) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        
        {/* Table & Pagination (Left 3 cols) */}
        <div className="flex flex-col gap-4">
          {isError ? (
            <div className="card text-center p-8 shadow-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-subtle)' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
              <p className="font-semibold text-sm">Failed to load quotes list. Please check your network connection and try again.</p>
            </div>
          ) : isLoading ? (
            <div className="card" style={{ padding: '2rem' }}>
              <SkeletonTable rows={perPage} cols={7} />
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="empty-state card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <FileText size={48} className="empty-state-icon text-muted" style={{ margin: '0 auto 1rem' }} />
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '1.125rem' }}>No quotes found</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '400px', margin: '0.5rem auto' }}>
                {searchQuery || statusFilter !== 'all' || timeFilter !== 'all'
                  ? 'Try adjusting your search criteria, filters, or date ranges to see results.'
                  : 'Create your first proposal layout and draft it directly inside our quotation builder.'}
              </p>
              {(searchQuery || statusFilter !== 'all' || timeFilter !== 'all') ? (
                <button onClick={handleResetFilters} className="btn btn-secondary btn-sm" style={{ marginTop: '1rem' }}>
                  Clear Filters
                </button>
              ) : (
                <Link href="/quotes/create" className="btn btn-primary btn-sm" style={{ marginTop: '1rem', background: 'var(--accent)' }}>
                   Draft Quote Now
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="data-table-wrap">
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Quote Number</th>
                        <th>Lead / Client</th>
                        <th>Quote Title</th>
                        <th>Total Amount</th>
                        <th>Valid Until</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedQuotes.map((quote) => (
                        <tr key={quote.id}>
                          <td style={{ verticalAlign: 'middle' }}>
                            <Link 
                              id={`view-quote-link-${quote.id}`} 
                              href={`/quotes/${quote.id}`}
                              className="text-accent hover:underline font-semibold"
                              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                            >
                              {quote.quote_number}
                            </Link>
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            {quote.lead ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{quote.lead.company_name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Lead #{quote.lead.id}
                                </span>
                              </div>
                            ) : quote.client ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{quote.client.name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Client #{quote.client.id}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8125rem' }}>Unassigned</span>
                            )}
                          </td>
                          <td style={{ verticalAlign: 'middle', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {quote.title}
                          </td>
                          <td style={{ verticalAlign: 'middle', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatCurrency(quote.total_amount, quote.currency)}
                          </td>
                          <td style={{ verticalAlign: 'middle', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                            {formatDate(quote.valid_until)}
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            {getStatusBadge(quote.status)}
                          </td>
                          <td style={{ verticalAlign: 'middle', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.375rem' }}>
                              <Link
                                id={`view-quote-btn-${quote.id}`}
                                href={`/quotes/${quote.id}`}
                                className="btn btn-ghost btn-sm btn-icon"
                                title="View Details"
                                style={{ width: '28px', height: '28px', padding: 0 }}
                              >
                                <Eye size={14} />
                              </Link>
                              
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                  id={`more-actions-btn-${quote.id}`}
                                  onClick={() => setActiveQuoteMenuId(activeQuoteMenuId === quote.id ? null : quote.id)}
                                  className="btn btn-ghost btn-sm btn-icon text-muted"
                                  title="More Actions"
                                  style={{ width: '28px', height: '28px', padding: 0 }}
                                >
                                  <MoreVertical size={14} />
                                </button>
                                
                                {activeQuoteMenuId === quote.id && (
                                  <>
                                    {/* Backdrop click closer */}
                                    <div
                                      onClick={() => setActiveQuoteMenuId(null)}
                                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}
                                    />
                                    
                                    {/* Dropdown Menu Container */}
                                    <div style={{
                                      position: 'absolute',
                                      top: '100%',
                                      right: 0,
                                      marginTop: '0.25rem',
                                      background: 'var(--surface-elevated)',
                                      border: '1px solid var(--border)',
                                      borderRadius: 'var(--radius-md)',
                                      boxShadow: 'var(--shadow-md)',
                                      zIndex: 50,
                                      minWidth: '170px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      padding: '0.25rem 0',
                                    }}>
                                      {/* View Details Link */}
                                      <Link
                                        href={`/quotes/${quote.id}`}
                                        onClick={() => setActiveQuoteMenuId(null)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          width: '100%',
                                          padding: '0.5rem 0.875rem',
                                          fontSize: '0.8125rem',
                                          color: 'var(--text-primary)',
                                          textAlign: 'left',
                                        }}
                                        className="hover:bg-[var(--surface-hover)]"
                                      >
                                        <Eye size={14} />
                                        View Details
                                      </Link>

                                      {/* Edit Quote Link (if draft/rejected) */}
                                      {(quote.status === 'draft' || quote.status === 'rejected') && (
                                        <Link
                                          href={`/quotes/create?id=${quote.id}`}
                                          onClick={() => setActiveQuoteMenuId(null)}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            width: '100%',
                                            padding: '0.5rem 0.875rem',
                                            fontSize: '0.8125rem',
                                            color: 'var(--text-primary)',
                                            textAlign: 'left',
                                          }}
                                          className="hover:bg-[var(--surface-hover)]"
                                        >
                                          <Edit2 size={14} />
                                          Edit Quote
                                        </Link>
                                      )}

                                      {/* Submit for Approval (if draft/rejected) */}
                                      {(quote.status === 'draft' || quote.status === 'rejected') && (
                                        <button
                                          onClick={() => submitApprovalMutation.mutate(quote.id)}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            width: '100%',
                                            padding: '0.5rem 0.875rem',
                                            fontSize: '0.8125rem',
                                            color: 'var(--text-primary)',
                                            textAlign: 'left',
                                            background: 'transparent',
                                          }}
                                          className="hover:bg-[var(--surface-hover)]"
                                        >
                                          <FileCheck2 size={14} />
                                          Submit Approval
                                        </button>
                                      )}

                                      {/* Approve Internally (if pending_approval and isApprover) */}
                                      {quote.status === 'pending_approval' && isApprover && (
                                        <button
                                          onClick={async () => {
                                            const comments = await prompt({
                                              title: 'Approve Quote',
                                              message: 'Comments / Notes (Optional)',
                                              placeholder: 'e.g. Approved. Terms are good.',
                                              defaultValue: ''
                                            });
                                            if (comments !== null) {
                                              approveMutation.mutate({ id: quote.id, comments });
                                            }
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            width: '100%',
                                            padding: '0.5rem 0.875rem',
                                            fontSize: '0.8125rem',
                                            color: 'var(--success)',
                                            textAlign: 'left',
                                            background: 'transparent',
                                          }}
                                          className="hover:bg-[var(--surface-hover)]"
                                        >
                                          <Check size={14} />
                                          Approve Quote
                                        </button>
                                      )}

                                      {/* Reject Internally (if pending_approval and isApprover) */}
                                      {quote.status === 'pending_approval' && isApprover && (
                                        <button
                                          onClick={async () => {
                                            const comments = await prompt({
                                              title: 'Reject Quote',
                                              message: 'Reason for rejection (Required)',
                                              placeholder: 'e.g. Budget is too low. Adjust rates.',
                                              defaultValue: ''
                                            });
                                            if (comments) {
                                              rejectMutation.mutate({ id: quote.id, comments });
                                            } else if (comments === '') {
                                              showToast('Rejection reason is required.', 'error');
                                            }
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            width: '100%',
                                            padding: '0.5rem 0.875rem',
                                            fontSize: '0.8125rem',
                                            color: 'var(--danger)',
                                            textAlign: 'left',
                                            background: 'transparent',
                                          }}
                                          className="hover:bg-[var(--surface-hover)]"
                                        >
                                          <X size={14} />
                                          Reject Quote
                                        </button>
                                      )}

                                      {/* Mark as Sent (if approved) */}
                                      {quote.status === 'approved' && (
                                        <button
                                          onClick={() => sendMutation.mutate(quote.id)}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            width: '100%',
                                            padding: '0.5rem 0.875rem',
                                            fontSize: '0.8125rem',
                                            color: 'var(--text-primary)',
                                            textAlign: 'left',
                                            background: 'transparent',
                                          }}
                                          className="hover:bg-[var(--surface-hover)]"
                                        >
                                          <ArrowUpRight size={14} />
                                          Mark as Sent
                                        </button>
                                      )}

                                      {/* Download PDF */}
                                      <button
                                        onClick={() => handleDownloadPdf(quote)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          width: '100%',
                                          padding: '0.5rem 0.875rem',
                                          fontSize: '0.8125rem',
                                          color: 'var(--text-primary)',
                                          textAlign: 'left',
                                          background: 'transparent',
                                        }}
                                        className="hover:bg-[var(--surface-hover)]"
                                      >
                                        <FileText size={14} />
                                        Download PDF
                                      </button>

                                      {/* Delete (if draft/rejected) */}
                                      {(quote.status === 'draft' || quote.status === 'rejected') && (
                                        <button
                                          onClick={async () => {
                                            if (await confirm({
                                              title: 'Delete Quote',
                                              message: `Are you sure you want to delete quote ${quote.quote_number}? This action cannot be undone.`,
                                              variant: 'danger'
                                            })) {
                                              deleteMutation.mutate(quote.id);
                                            }
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            width: '100%',
                                            padding: '0.5rem 0.875rem',
                                            fontSize: '0.8125rem',
                                            color: 'var(--danger)',
                                            textAlign: 'left',
                                            background: 'transparent',
                                          }}
                                          className="hover:bg-[var(--surface-hover)]"
                                        >
                                          <Trash2 size={14} />
                                          Delete Quote
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)'
              }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Showing <strong style={{ color: 'var(--text-primary)' }}>{Math.min((currentPage - 1) * perPage + 1, totalFiltered)}</strong> to <strong style={{ color: 'var(--text-primary)' }}>{Math.min(currentPage * perPage, totalFiltered)}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalFiltered}</strong> results
                </span>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {/* Page Size select */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <select
                      value={perPage}
                      onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                      style={{ fontSize: '0.8125rem', height: '32px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 0.5rem', outline: 'none' }}
                    >
                      <option value={5}>5 per page</option>
                      <option value={10}>10 per page</option>
                      <option value={20}>20 per page</option>
                      <option value={50}>50 per page</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {[...Array(lastPage)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i + 1)}
                        className="btn btn-sm"
                        style={{
                          width: '32px',
                          height: '32px',
                          padding: 0,
                          background: currentPage === i + 1 ? 'var(--accent)' : 'var(--surface-elevated)',
                          color: currentPage === i + 1 ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          fontWeight: currentPage === i + 1 ? '600' : 'normal'
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                      disabled={currentPage === lastPage}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sidebar (Right 1 col) */}
        <div className="flex flex-col gap-6">
          
          {/* Quote Overview (Donut Chart) */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>Quote Overview</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minHeight: '120px' }}>
              <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DonutChart converted={convertedCount} draft={draftCount} expired={expiredCount} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Converted</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{convertedCount} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({convertedPct.toFixed(1)}%)</span></span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--info)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Draft</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{draftCount} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({draftPct.toFixed(1)}%)</span></span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Expired</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{expiredCount} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({expiredPct.toFixed(1)}%)</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>Recent Activity</h3>
              <span className="text-accent hover:underline" style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>View all</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {isLoading || activityLog.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No recent activities</p>
              ) : (
                activityLog.map((activity) => {
                  const ActivityIcon = activity.Icon;
                  return (
                    <div key={activity.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${activity.classColors}`}>
                        <ActivityIcon size={14} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1 }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3 }}>
                          {activity.message}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {activity.time}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Need Help Guide Card */}
          <div className="card" style={{
            padding: '1.25rem',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)',
            border: '1px solid rgba(124, 58, 237, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', zIndex: 1 }}>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Need help?</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, maxWidth: '160px' }}>
                  Learn how quotations work and get the most out of quotations.
                </p>
              </div>
              
              {/* Question illustration graphic */}
              <div style={{
                width: '60px',
                height: '60px',
                background: 'var(--accent-subtle)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                alignSelf: 'flex-start',
                border: '1px solid rgba(124, 58, 237, 0.2)'
              }}>
                <FileQuestion size={26} className="text-accent animate-pulse" />
              </div>
            </div>

            <button 
              className="btn btn-secondary btn-sm" 
              style={{
                width: 'fit-content',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontWeight: 600,
                zIndex: 1,
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              View Guide
            </button>

            {/* Glowing background circles for design aesthetics */}
            <div style={{
              position: 'absolute',
              bottom: '-30px',
              right: '-30px',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: 'var(--accent)',
              opacity: 0.05,
              filter: 'blur(20px)'
            }} />
          </div>

        </div>

      </div>

    </div>
  );
}
