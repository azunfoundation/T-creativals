'use client';

import { useState, useEffect, Suspense } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useToast } from '@/hooks/useToast';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  invoices as invoicesApi,
  quotes as quotesApi,
  services as servicesApi,
  leads as leadsApi,
  clientsApi,
  platformSettings,
  getApiErrorMessage
} from '@/lib/api';
import type { Lead, Service, Quote, Invoice, InvoiceItem } from '@/lib/api';
import { Plus, Trash2, ArrowLeft, Percent, Check, X, ShieldAlert, FileText, Calendar, User } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const INVOICES_CREATE_HOWTO = {
  overview: 'This form builds a new client invoice. You pick the client, add line items (what you are billing for), and the totals — discounts and GST included — are calculated for you as you type.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Fastest route: pick a quote in "Convert Approved Quotation" at the top — it auto-fills the client, line items, currency, and terms.',
        'Otherwise fill Section 1 by hand: give the invoice a clear title, select the client, and check the issue and due dates (due date defaults to 14 days out).',
        'In Section 2, add one row per thing you are billing. Picking a Catalog Service fills the description, price, and tax rate; or choose "Custom Invoice Entry" and type your own.',
        'Watch Section 4 (Summary Invoice Totals) update live, then click "Create Invoice". A new invoice always starts in Draft status.',
      ],
    },
    {
      heading: 'How the math works',
      items: [
        'Each row: Qty × Unit Price = subtotal, minus the row\'s Discount %, plus GST at the row\'s Tax Rate.',
        'The Summary panel adds all rows: Subtotal − Line Discounts = Taxable Value, then + GST = Final Invoice Amount.',
        'Discounts are entered per line item as a percentage, not as one overall figure.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Write specific line-item descriptions ("Homepage design — 2 revisions") — the client sees them on the invoice.',
        'Double-check the Billing Currency before adding prices; all amounts are in that currency.',
        'Use Internal Notes for anything the client should not see — Client Notes and Terms appear on the invoice itself.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Leaving the default 18% GST on items that should be 0% or another slab — set the Tax Rate per row.',
        'Forgetting to remove the empty first row\'s zero-price entry after adding real items.',
        'Ticking "Recurring" by accident — that makes the system re-issue this invoice automatically on the chosen interval.',
      ],
    },
  ],
};

interface LineItemState {
  service_id: number | '';
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
}

function InvoiceBuilderForm() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteParamId = searchParams.get('quoteId') || searchParams.get('quote_id');

  // Form Field States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [quoteId, setQuoteId] = useState<number | ''>('');
  const [leadId, setLeadId] = useState<number | ''>('');
  const [currency, setCurrency] = useState('INR');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [terms, setTerms] = useState(
    '1. Payment Mode: Bank Transfer / UPI.\n2. Interest of 2% per month will be charged on overdue invoices after the due date.\n3. All disputes are subject to local jurisdiction.'
  );
  const [clientNotes, setClientNotes] = useState('Thank you for choosing Creativals!');
  const [internalNotes, setInternalNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [lineItems, setLineItems] = useState<LineItemState[]>([
    { service_id: '', description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 18 }
  ]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch Quotes (to allow prefilling directly from dropdown)
  const { data: quotesList = [] } = useQuery<Quote[]>({
    queryKey: ['quotes_all'],
    queryFn: async () => {
      const res = await quotesApi.list({ per_page: 100 });
      return res.data.data;
    }
  });

  // Fetch CRM Leads
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ['leads_all'],
    queryFn: async () => {
      const res = await leadsApi.list({ per_page: 100 });
      return res.data.data;
    }
  });

  // Fetch Catalog Services
  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['services_all'],
    queryFn: async () => {
      const res = await servicesApi.list();
      const data = res.data || [];
      return data.map((s: any) => ({
        ...s,
        base_price: s.base_price || s.default_price || 0
      }));
    }
  });

  // Fetch platform currencies (same source used by quotes/create)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await platformSettings.get();
      return res.data;
    }
  });

  // Client picker: the Clients module directory (clients.view). The previous
  // roles+users lookup required roles.view/users.view, which only
  // founder/director hold — the picker was silently empty for finance.
  const { data: clientUsers = [], isError: isClientsError } = useQuery({
    queryKey: ['clients_directory', 'picker'],
    queryFn: async () => {
      const res = await clientsApi.list();
      return (res.data?.breakdown || []).map((c) => ({
        id: c.client_id,
        name: c.company_name ? `${c.company_name} (${c.client_name})` : c.client_name,
        email: c.client_email,
      }));
    },
  });

  // Set default issue and due dates
  useEffect(() => {
    if (!issueDate) {
      setIssueDate(new Date().toISOString().split('T')[0]);
    }
    if (!dueDate) {
      const future = new Date();
      future.setDate(future.getDate() + 14); // 14 days default payment terms
      setDueDate(future.toISOString().split('T')[0]);
    }
  }, [issueDate, dueDate]);

  // Prefill when quoteId is selected or loaded via URL param
  const loadQuoteDetails = (qId: number) => {
    // Search in quotesList
    const quote = quotesList.find(q => q.id === qId);
    if (quote) {
      setTitle(`Invoice for ${quote.title}`);
      setQuoteId(quote.id);
      setLeadId(quote.lead_id || '');
      if (quote.client_id) setClientId(quote.client_id);

      const code = typeof quote.currency === 'object' && quote.currency
        ? (quote.currency as any).code
        : quote.currency;
      if (code) setCurrency(code);

      if (quote.items && quote.items.length > 0) {
        setLineItems(
          quote.items.map(item => ({
            service_id: item.service_id || '',
            description: item.description || '',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            discount_percent: item.discount_percent || 0,
            tax_rate: item.tax_rate ?? 18,
          }))
        );
      }

      if (quote.terms_conditions) {
        setTerms(quote.terms_conditions);
      }
    }
  };

  // Check URL quoteId param
  useEffect(() => {
    if (quoteParamId && quotesList.length > 0) {
      loadQuoteDetails(Number(quoteParamId));
    }
  }, [quoteParamId, quotesList]);

  // Handle service drop-down selection
  const handleServiceChange = (index: number, serviceIdVal: number | '') => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index].service_id = serviceIdVal;
      
      if (serviceIdVal !== '') {
        const found = services.find(s => s.id === serviceIdVal);
        if (found) {
          updated[index].description = found.description || found.name;
          updated[index].unit_price = found.base_price;
          updated[index].tax_rate = found.tax_rate ?? 18;
        }
      }
      return updated;
    });
  };

  const handleLineItemChange = (index: number, field: keyof LineItemState, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { service_id: '', description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 18 }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Math Calculations
  const rowCalculations = lineItems.map(item => {
    const subtotal = item.quantity * item.unit_price;
    const discountAmount = subtotal * (item.discount_percent / 100);
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = taxableAmount * (item.tax_rate / 100);
    const totalAmount = taxableAmount + taxAmount;
    return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
  });

  const subtotalSum = rowCalculations.reduce((sum, row) => sum + row.subtotal, 0);
  const itemsDiscountSum = rowCalculations.reduce((sum, row) => sum + row.discountAmount, 0);
  const taxSum = rowCalculations.reduce((sum, row) => sum + row.taxAmount, 0);
  const finalNetTotal = rowCalculations.reduce((sum, row) => sum + row.totalAmount, 0);

  const createMutation = useMutation({
    mutationFn: (data: any) => invoicesApi.create(data),
    onSuccess: (res) => {
      router.push(`/invoices/${res.data.id}`);
    },
    onError: (err: any) => {
      setSubmitError(getApiErrorMessage(err, 'Failed to create invoice.'));
      showToast(getApiErrorMessage(err, 'Failed to create invoice.'), 'error');
    }
  });

  // Submit/Save Action
  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      showToast('Please enter an invoice title.', 'info');
      return;
    }
    if (!clientId) {
      showToast('Please select a client.', 'info');
      return;
    }
    if (lineItems.some(i => i.unit_price < 0 || i.quantity <= 0)) {
      showToast('Line items must have positive quantity and non-negative unit price.', 'info');
      return;
    }

    const selectedCurrencyObj = settings?.currencies?.find(c => c.code === currency);
    const currencyId = selectedCurrencyObj ? selectedCurrencyObj.id : 1;

    const payload = {
      quote_id: quoteId ? Number(quoteId) : undefined,
      lead_id: leadId ? Number(leadId) : undefined,
      client_id: Number(clientId),
      currency_id: currencyId,
      title: title.trim(),
      description: description.trim() || undefined,
      issue_date: issueDate,
      due_date: dueDate,
      terms_conditions: terms,
      client_notes: clientNotes || undefined,
      internal_notes: internalNotes || undefined,
      is_recurring: isRecurring,
      recurring_interval: isRecurring ? recurringInterval : undefined,
      recurring_end_date: (isRecurring && recurringEndDate) ? recurringEndDate : undefined,
      items: lineItems.map(item => ({
        service_id: item.service_id ? Number(item.service_id) : undefined,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount_percent: Number(item.discount_percent),
        tax_rate: Number(item.tax_rate),
      }))
    };

    createMutation.mutate(payload);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link href="/invoices" className="btn btn-secondary btn-icon" style={{ padding: '0.5rem' }}>
          <ArrowLeft size={16} />
        </Link>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Back to Invoices</span>
      </div>

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Create Client Invoice
            <HelpIcon title="Creating an Invoice" content={{
              what: 'A form for building a new bill: pick the client, list what you are charging for, and the totals with GST are calculated automatically.',
              why: 'The invoice is what the client receives and pays against — accurate line items and tax rates here mean correct billing later.',
              when: 'Create one when work or a milestone is agreed. If a quote was already approved, use "Convert Approved Quotation" to prefill everything.',
            }} />
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Draft a custom client invoice or import line items and scope agreements directly from a pre-approved quotation.
          </p>
        </div>
        <HowToUseGuide moduleKey="invoices-create" title="How Invoice Creation Works" content={INVOICES_CREATE_HOWTO} />
      </div>

      {/* Pre-fill toolbar */}
      <div className="card" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          <FileText size={18} className="text-accent" />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Convert Approved Quotation</span>
          <HelpIcon text="Pick an approved quote to auto-fill the client, line items, currency, and terms — no retyping needed." />
        </div>
        <div>
          <select
            onChange={(e) => {
              if (e.target.value) loadQuoteDetails(Number(e.target.value));
            }}
            className="form-input"
            style={{ width: 'auto', minWidth: '240px', padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
          >
            <option value="">-- Choose Quote to Prefill --</option>
            {quotesList
              .filter(q => q.status === 'approved' || q.status === 'accepted' || q.status === 'converted' || q.status === 'pending_approval')
              .map(q => (
                <option key={q.id} value={q.id}>
                  {q.quote_number} - {q.lead?.company_name || q.title}
                </option>
              ))
            }
          </select>
        </div>
      </div>

      <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Step 1: Invoice metadata */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <User size={14} className="text-accent" />
            1. Invoice & Client Details
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {/* Title */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Invoice Title *</label>
              <input
                type="text"
                placeholder="e.g. Website Development Milestone 1 Payment"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                required
              />
            </div>

            {/* Client */}
            <div className="form-group">
              <label className="form-label">Client *</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
                className="form-input"
                required
              >
                <option value="">-- Select Client --</option>
                {clientUsers.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
              {isClientsError && (
                <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.375rem' }}>
                  Couldn't load the client list — refresh the page to retry.
                </p>
              )}
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <input
                type="text"
                placeholder="Short internal summary of this invoice"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {/* Lead relation */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                CRM Lead (Optional)
                <HelpIcon text="Link the sales lead this invoice came from so revenue shows up in CRM reporting. Leave as Unlinked if there is none." />
              </label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : '')}
                className="form-input"
              >
                <option value="">-- Unlinked --</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.company_name}</option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div className="form-group">
              <label className="form-label">Billing Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="form-input"
              >
                {settings?.currencies?.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                )) || (
                  <>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </>
                )}
              </select>
            </div>

            {/* Issue Date */}
            <div className="form-group">
              <label className="form-label">Issue Date *</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="form-input"
                required
              />
            </div>

            {/* Due Date */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Due Date *
                <HelpIcon text="Defaults to 14 days after today. If the invoice is still unpaid after this date it is flagged as Overdue." />
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>
        </div>

        {/* Step 2: Line items */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              2. Line Items Details
            </h2>
            <button
              type="button"
              onClick={addLineItem}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              <Plus size={14} /> Add Item Row
            </button>
          </div>

          <div className="data-table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ tableLayout: 'fixed', minWidth: '950px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Catalog Service</th>
                    <th style={{ width: '28%' }}>Item Description</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Qty</th>
                    <th style={{ width: '14%' }}>Unit Price ({currency})</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>
                      Discount %
                      <HelpIcon text="Percentage off this row's Qty × Unit Price. Applied before GST is calculated." />
                    </th>
                    <th style={{ width: '10%' }}>
                      Tax Rate (GST)
                      <HelpIcon text="GST slab for this item (0–28%). Charged on the discounted amount. Catalog services set this automatically." />
                    </th>
                    <th style={{ width: '12%', textAlign: 'right' }}>
                      Total Amount
                      <HelpIcon text="Calculated for you: (Qty × Unit Price − discount) + GST." />
                    </th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index}>
                      {/* Service Selection */}
                      <td>
                        <select
                          value={item.service_id}
                          onChange={(e) => handleServiceChange(index, e.target.value ? Number(e.target.value) : '')}
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
                        >
                          <option value="">-- Custom Invoice Entry --</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Description */}
                      <td>
                        <textarea
                          rows={2}
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          placeholder="Detailed deliverables description..."
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', resize: 'none', lineHeight: 1.4 }}
                        />
                      </td>

                      {/* Quantity */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity ?? 1}
                          onChange={(e) => handleLineItemChange(index, 'quantity', Number(e.target.value))}
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', textAlign: 'center' }}
                          required
                        />
                      </td>

                      {/* Unit Price */}
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={item.unit_price ?? 0}
                          onChange={(e) => handleLineItemChange(index, 'unit_price', Number(e.target.value))}
                          placeholder="0"
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
                          required
                        />
                      </td>

                      {/* Discount % */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.discount_percent ?? 0}
                          onChange={(e) => handleLineItemChange(index, 'discount_percent', Number(e.target.value))}
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', textAlign: 'center' }}
                        />
                      </td>

                      {/* Tax Rate */}
                      <td>
                        <select
                          value={item.tax_rate ?? 18}
                          onChange={(e) => handleLineItemChange(index, 'tax_rate', Number(e.target.value))}
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </td>

                      {/* Total */}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', verticalAlign: 'middle' }}>
                        {formatCurrency(rowCalculations[index]?.totalAmount || 0, currency)}
                      </td>

                      {/* Delete item */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                          className="btn btn-danger btn-sm btn-icon"
                          style={{ opacity: lineItems.length === 1 ? 0.3 : 1 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Step 3: Terms and Totals */}
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '1.5rem' }}>
          {/* Notes and Terms */}
          <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                3. Terms & Notes
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Client Terms & Conditions</label>
                  <textarea
                    rows={4}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="form-input"
                    style={{ resize: 'none', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.5 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Client Notes (Footer, visible to client)</label>
                  <textarea
                    rows={2}
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    className="form-input"
                    style={{ resize: 'none', fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Internal Notes (Hidden from Client)</label>
                  <textarea
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className="form-input"
                    style={{ resize: 'none', fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                </div>

                {/* Recurring Settings */}
                <div className="form-group" style={{ marginTop: '0.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.375rem', backgroundColor: 'var(--bg-secondary)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, cursor: 'pointer', marginBottom: isRecurring ? '1rem' : 0, fontSize: '0.875rem' }}>
                    <input 
                      type="checkbox" 
                      checked={isRecurring} 
                      onChange={(e) => setIsRecurring(e.target.checked)} 
                      style={{ accentColor: 'var(--accent)', width: '1rem', height: '1rem' }}
                    />
                    Make this a Recurring Invoice
                    <HelpIcon text="The system will automatically re-issue a copy of this invoice on the chosen interval (daily/weekly/monthly/yearly) until the end date. Use for retainers and subscriptions." />
                  </label>
                  
                  {isRecurring && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Billing Interval</label>
                        <select 
                          value={recurringInterval} 
                          onChange={(e) => setRecurringInterval(e.target.value as any)} 
                          className="form-input"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">End Date (Optional)</label>
                        <input 
                          type="date" 
                          value={recurringEndDate} 
                          onChange={(e) => setRecurringEndDate(e.target.value)} 
                          className="form-input"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Totals panel */}
          <div style={{ flex: '1 1 300px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: 'fit-content' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                4. Summary Invoice Totals
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  <span>Subtotal (Base)</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(subtotalSum, currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  <span>Line Discounts</span>
                  <span style={{ fontWeight: 600, color: 'var(--danger)' }}>-{formatCurrency(itemsDiscountSum, currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Taxable Value
                    <HelpIcon text="Subtotal minus line discounts. GST is calculated on this figure, not on the raw subtotal." />
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(subtotalSum - itemsDiscountSum, currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  <span>GST Tax Total</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(taxSum, currency)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Final Invoice Amount
                    <HelpIcon text="Taxable Value + GST — the total the client will be asked to pay." />
                  </span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>
                    {formatCurrency(finalNetTotal, currency)}
                  </span>
                </div>
              </div>

              {submitError && (
                <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{submitError}</span>
                </div>
              )}

              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem' }}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Invoice'}
                </button>
                <Link
                  href="/invoices"
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '0.75rem', textAlign: 'center' }}
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}

export default function CreateInvoicePage() {
  const { showToast } = useToast();
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', minHeight: '60vh' }}>
        <div className="animate-pulse" style={{ color: 'var(--accent)', fontWeight: 600 }}>Loading Invoice Builder...</div>
      </div>
    }>
      <InvoiceBuilderForm />
    </Suspense>
  );
}
