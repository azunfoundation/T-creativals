'use client';

import { useState, useEffect, Suspense } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useToast } from '@/hooks/useToast';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  quotes as quotesApi,
  leads as leadsApi,
  services as servicesApi,
  coupons as couponsApi,
  platformSettings,
  clientsApi,
  projects as projectsApi,
  getApiErrorMessage
} from '@/lib/api';
import type { Lead, Service, Quote, QuoteItem } from '@/lib/api';
import { Plus, Trash2, ArrowLeft, Percent, Tag, Check, X, ShieldAlert, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useWorkspace } from '@/providers/WorkspaceProvider';

const QUOTES_CREATE_HOWTO = {
  overview: 'This builder creates a priced proposal (quote) for a lead or client. Add one line per service, set quantities, discounts, and GST, and the totals on the right update automatically. Saving stores the quote as a Draft — nothing is sent to the client from this page.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Give the quote a clear title and pick who it is for — a Lead from the CRM, or an Existing Client (or leave both blank).',
        'Add a row per service under "Line Items". Picking a Service Product auto-fills its description, price, and GST rate; you can still edit them.',
        'Set Qty, Unit Price, Disc %, and Tax Rate on each row — the row total and the "Quotation Totals" card recalculate as you type.',
        'Optionally apply a coupon code and adjust the client-facing Terms & Conditions.',
        'Click "Save as Draft" — you will land on the quote page, where you submit it for internal approval before it can go to the client.',
      ],
    },
    {
      heading: 'Discounts, taxes & totals',
      items: [
        'Disc % is a per-line discount, applied to that row before GST is calculated.',
        'A coupon is an extra discount applied to the whole quote total, after all line items and taxes.',
        'GST is charged per line on the discounted amount — most services use 18%.',
        '"Net Estimated Total" is the final amount the client will be asked to approve.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Write concrete deliverables in each row description — this text appears word-for-word on the client-facing quote.',
        'Check the "Valid Until" date (it defaults to 30 days ahead) and keep it in line with your Terms & Conditions.',
        'Use "Internal Staff Comments" for margin or negotiation notes — clients never see that field.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Leaving Unit Price at 0 after choosing "-- Custom Scope --" instead of a listed service.',
        'Stacking a big line discount AND a coupon without checking the final margin.',
        'Forgetting to pick a Lead or Client — the quote saves, but it will not be linked to anyone for follow-up.',
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

// (mock leads and services array removed — real data from backend API must be used)

function QuoteBuilderForm() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const leadParamId = searchParams.get('lead_id');
  const { activeProjectId } = useWorkspace();

  const isEdit = !!editId;

  // Form Field States
  const [title, setTitle] = useState('');
  const [leadId, setLeadId] = useState<number | ''>('');
  const [clientId, setClientId] = useState<number | ''>('');

  // Prefill client from active project context
  useEffect(() => {
    if (activeProjectId && !clientId) {
      projectsApi.get(activeProjectId).then((res) => {
        const raw: any = res.data;
        const p = raw?.data || raw;
        if (p && p.client_id) {
          setClientId(Number(p.client_id));
        }
      }).catch(() => {});
    }
  }, [activeProjectId, clientId]);
  const [currency, setCurrency] = useState('INR');
  const [validUntil, setValidUntil] = useState('');
  const [terms, setTerms] = useState(
    '1. Validity: This quote is valid for 30 days from the date of issue.\n2. Payment Terms: 50% advance, 50% upon delivery.\n3. Taxes: 18% GST will be applicable on all services.\n4. Deliverables: Any additional scope will be charged extra.'
  );
  const [comments, setComments] = useState('');
  const [lineItems, setLineItems] = useState<LineItemState[]>([
    { service_id: '', description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 18 }
  ]);

  // Coupon States
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

  // Queries
  const { data: leadsRes } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const res = await leadsApi.list({ per_page: 100 });
      return res.data?.data || [];
    }
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await servicesApi.list();
      const data = res.data || [];
      return data.map((s: any) => ({
        ...s,
        base_price: Number(s.base_price || s.default_price || 0),
        tax_rate: s.tax_rate !== null && s.tax_rate !== undefined ? Number(s.tax_rate) : undefined
      }));
    }
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      try {
        const res = await platformSettings.get();
        return res.data;
      } catch {
        return null;
      }
    }
  });

  // Client picker: the Clients module directory (clients.view). The previous
  // roles+users lookup required roles.view/users.view — only founder/director
  // hold those, so the picker was silently empty for the sales roles this
  // page is built for.
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

  // Load Edit Quote Details if editId is provided
  const { data: editQuote } = useQuery<Quote>({
    queryKey: ['quote-detail', editId],
    queryFn: async () => {
      if (!editId) throw new Error('No ID');
      const res = await quotesApi.get(Number(editId));
      return res.data;
    },
    enabled: isEdit,
  });

  // Prepopulate form when editing
  useEffect(() => {
    if (editQuote) {
      setTitle(editQuote.title);
      setLeadId(editQuote.lead_id || '');
      setClientId(editQuote.client_id || '');
      if (editQuote.currency) {
        const code = typeof editQuote.currency === 'object' && editQuote.currency
          ? (editQuote.currency as any).code
          : editQuote.currency;
        setCurrency(code);
      }
      // Format YYYY-MM-DD
      const dateVal = editQuote.valid_until ? editQuote.valid_until.split('T')[0] : '';
      setValidUntil(dateVal);
      setTerms(editQuote.terms_conditions || '');
      setComments(editQuote.internal_notes || '');

      if (editQuote.items && editQuote.items.length > 0) {
        setLineItems(
          editQuote.items.map(item => ({
            service_id: item.service_id || '',
            description: item.description || '',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            discount_percent: item.discount_percent || 0,
            tax_rate: item.tax_rate !== undefined && item.tax_rate !== null ? Number(item.tax_rate) : 18,
          }))
        );
      }

      if (editQuote.coupon_code) {
        setCouponCode(editQuote.coupon_code);
        // Deduce details if coupon was applied
        setAppliedCoupon({
          code: editQuote.coupon_code,
          discount_type: 'fixed', // Fallback
          discount_value: 0 // Will re-validate client-side
        });
      }
    }
  }, [editQuote]);

  // Set default tax rate for new quotes once settings are loaded
  useEffect(() => {
    if (!isEdit && settings?.tax?.default_tax_rate !== undefined) {
      const defaultTax = Number(settings.tax.default_tax_rate);
      setLineItems(prev => {
        if (prev.length === 1 && prev[0].service_id === '' && prev[0].unit_price === 0 && prev[0].tax_rate === 18) {
          return [{ ...prev[0], tax_rate: defaultTax }];
        }
        return prev;
      });
    }
  }, [settings, isEdit]);

  // Handle lead_id query param auto-selection (only on create)
  useEffect(() => {
    if (!isEdit && leadParamId) {
      setLeadId(Number(leadParamId));
    }
  }, [leadParamId, isEdit]);

  // Set default validity date (30 days from now)
  useEffect(() => {
    if (!validUntil) {
      const today = new Date();
      today.setDate(today.getDate() + 30);
      setValidUntil(today.toISOString().split('T')[0]);
    }
  }, [validUntil]);

  // Re-run coupon validation if applied and lines change
  const handleServiceChange = (index: number, serviceIdVal: number | '') => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index].service_id = serviceIdVal;
      
      if (serviceIdVal !== '') {
        const found = services.find(s => s.id === serviceIdVal);
        if (found) {
          updated[index].description = found.description || found.name;
          updated[index].unit_price = found.base_price;
          updated[index].tax_rate = found.tax_rate !== undefined && found.tax_rate !== null 
            ? Number(found.tax_rate) 
            : (settings?.tax?.default_tax_rate !== undefined ? Number(settings.tax.default_tax_rate) : 18);
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
    const defaultTaxRate = settings?.tax?.default_tax_rate !== undefined ? Number(settings.tax.default_tax_rate) : 18;
    setLineItems(prev => [
      ...prev,
      { service_id: '', description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: defaultTaxRate }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // ── Calculation Logic ─────────────────────────────────────────
  // Row subtotals
  const rowCalculations = lineItems.map(item => {
    const subtotal = item.quantity * item.unit_price;
    const discountAmount = subtotal * (item.discount_percent / 100);
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = taxableAmount * (item.tax_rate / 100);
    const totalAmount = taxableAmount + taxAmount;
    return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
  });

  // Quote totals
  const subtotalSum = rowCalculations.reduce((sum, row) => sum + row.subtotal, 0);
  const itemsDiscountSum = rowCalculations.reduce((sum, row) => sum + row.discountAmount, 0);
  const taxSum = rowCalculations.reduce((sum, row) => sum + row.taxAmount, 0);
  const totalBeforeCoupon = rowCalculations.reduce((sum, row) => sum + row.totalAmount, 0);

  // Apply Coupon discount
  let couponDiscountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === 'percentage') {
      couponDiscountAmount = totalBeforeCoupon * (appliedCoupon.discount_value / 100);
    } else {
      couponDiscountAmount = appliedCoupon.discount_value;
    }
  }

  const finalNetTotal = Math.max(0, totalBeforeCoupon - couponDiscountAmount);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    try {
      setCouponError(null);
      setCouponSuccess(null);
      
      const res = await couponsApi.validate(couponCode.trim(), totalBeforeCoupon);
      const data = res.data;
      
      if (data.valid) {
        setAppliedCoupon({
          code: couponCode.trim().toUpperCase(),
          discount_type: 'fixed',
          discount_value: data.discount_amount,
        });
        setCouponSuccess(data.message || `Coupon ${couponCode.toUpperCase()} applied successfully!`);
      } else {
        setCouponError(data.message || 'Coupon is not valid for this amount.');
        setAppliedCoupon(null);
      }
    } catch (err: any) {
      setCouponError(getApiErrorMessage(err, 'Failed to validate coupon code. Please try again.'));
      setAppliedCoupon(null);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponSuccess(null);
    setCouponError(null);
  };

  // Submit mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => quotesApi.create(data),
    onSuccess: (res) => {
      router.push(`/quotes/${res.data.id}`);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to create quote.'), 'error');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => quotesApi.update(id, data),
    onSuccess: () => {
      router.push(`/quotes/${editId}`);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to update quote.'), 'error');
    }
  });

  const handleSaveQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Please enter a quote title.', 'info');
      return;
    }
    if (lineItems.some(i => i.unit_price < 0 || i.quantity <= 0)) {
      showToast('Line items must have positive quantity and non-negative unit price.', 'info');
      return;
    }

    const selectedCurrencyObj = settings?.currencies?.find(c => c.code === currency);
    const currencyId = selectedCurrencyObj ? selectedCurrencyObj.id : 1;

    const payload = {
      lead_id: leadId ? Number(leadId) : undefined,
      client_id: clientId ? Number(clientId) : undefined,
      title: title.trim(),
      currency_id: currencyId,
      valid_until: new Date(validUntil).toISOString(),
      coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
      terms_conditions: terms,
      internal_notes: comments,
      items: lineItems.map(item => ({
        service_id: item.service_id ? Number(item.service_id) : undefined,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount_percent: Number(item.discount_percent),
        tax_rate: Number(item.tax_rate),
      }))
    };

    if (isEdit) {
      updateMutation.mutate({ id: Number(editId), data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const leads = leadsRes || [];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Breadcrumb / Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link href="/quotes" className="btn btn-secondary btn-icon" style={{ padding: '0.375rem' }}>
          <ArrowLeft size={16} />
        </Link>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Back to Quotes</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Modify Quotation' : 'Create Quotation Proposal'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {isEdit ? `Editing drafted Quote #${editQuote?.quote_number || editId}` : 'Add custom service scope details, discount coupon terms, and compute taxes dynamically.'}
          </p>
        </div>
        <HowToUseGuide moduleKey="quotes-create" title="How the Quote Builder Works" content={QUOTES_CREATE_HOWTO} />
      </div>

      <form onSubmit={handleSaveQuote} className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Core Settings Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            1. Quote Details
          </h2>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Title */}
            <div className="form-group" style={{ flex: '2 1 400px' }}>
              <label className="form-label">Quote Title *</label>
              <input
                type="text"
                placeholder="e.g. Enterprise Branding & Copywriting Package"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                required
              />
            </div>

            {/* Lead selector */}
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Associated Lead / Client
                <HelpIcon text="The CRM lead this proposal is for. Their company name and contact appear on the quote document." />
              </label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : '')}
                className="form-input"
              >
                <option value="">-- Select Lead (Optional) --</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.company_name}</option>
                ))}
              </select>
            </div>

            {/* Client selector (for quotes not tied to a lead) */}
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Existing Client (Optional)
                <HelpIcon text="Use this instead of a lead when quoting someone who is already a client in the system (repeat business)." />
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
                className="form-input"
              >
                <option value="">-- None --</option>
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

            {/* Currency selector */}
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label className="form-label">Currency</label>
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
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Validity Date */}
            <div className="form-group" style={{ flex: '1 1 200px', maxWidth: '300px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Valid Until *
                <HelpIcon text="The offer's expiry date (defaults to 30 days from today). After this date the quote shows as Expired and should be re-issued, not resent." />
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>
        </div>

        {/* Dynamic Line Items Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              2. Line Items
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

          {/* Table Container */}
          <div className="data-table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ tableLayout: 'fixed', minWidth: '950px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Service Product</th>
                    <th style={{ width: '28%' }}>Description</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Qty</th>
                    <th style={{ width: '14%' }}>Unit Price ({currency})</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Disc % <HelpIcon text="Discount on this line only, taken off before GST is calculated. Use the coupon box below for a whole-quote discount." /></th>
                    <th style={{ width: '10%' }}>Tax Rate (GST) <HelpIcon text="GST charged on this line's discounted amount. Auto-fills from the selected service; most services use 18%." /></th>
                    <th style={{ width: '12%', textAlign: 'right' }}>Total ({currency})</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index}>
                      {/* Service selection dropdown */}
                      <td>
                        <select
                          value={item.service_id}
                          onChange={(e) => handleServiceChange(index, e.target.value ? Number(e.target.value) : '')}
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
                        >
                          <option value="">-- Custom Scope --</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Description text area */}
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
                          value={item.quantity}
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
                          value={item.discount_percent}
                          onChange={(e) => handleLineItemChange(index, 'discount_percent', Number(e.target.value))}
                          className="form-input"
                          style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', textAlign: 'center' }}
                        />
                      </td>

                      {/* Tax Rate (GST) */}
                      <td>
                        <select
                          value={item.tax_rate}
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

                      {/* Row Total (read-only) */}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', verticalAlign: 'middle' }}>
                        {formatCurrency(rowCalculations[index]?.totalAmount || 0, currency)}
                      </td>

                      {/* Remove button */}
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

        {/* Footer Grid: Coupon, Terms on Left; Totals on Right */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* Left Column: Terms, Comments & Coupons */}
          <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Coupon Box */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Tag size={16} className="text-accent" />
                <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Discount Coupon Code
                </h3>
                <HelpIcon text="Optional extra discount applied to the whole quote total, after line-item discounts and GST. Only one coupon per quote." />
              </div>

              {appliedCoupon ? (
                <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Sparkles className="text-accent" size={18} />
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Coupon applied: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{appliedCoupon.code}</strong>
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.125rem' }}>
                        Discount benefit: {appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}% Off` : `${formatCurrency(appliedCoupon.discount_value, currency)} Off`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="btn btn-secondary btn-sm btn-icon"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Enter Code (e.g. WELCOME10, FLAT5000)"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setCouponError(null); }}
                    className="form-input"
                    style={{ flex: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="btn btn-secondary"
                  >
                    Apply Code
                  </button>
                </div>
              )}

              {couponError && (
                <p style={{ color: 'var(--danger)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <ShieldAlert size={12} /> {couponError}
                </p>
              )}
              {couponSuccess && (
                <p style={{ color: 'var(--success)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Check size={12} /> {couponSuccess}
                </p>
              )}
            </div>

            {/* Terms & Comments */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                3. Terms & Comments
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Client-facing Terms & Conditions
                    <HelpIcon text="Printed on the quote the client receives — validity, payment split, and tax notes. Edit it to match what you agreed for this deal." />
                  </label>
                  <textarea
                    rows={4}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="form-input"
                    style={{ resize: 'none', fontFamily: 'monospace', lineHeight: 1.5, fontSize: '0.8125rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Internal Staff Comments (Hidden from Client)</label>
                  <textarea
                    rows={2}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Enter details on margins, sales velocity, custom requirements, etc."
                    className="form-input"
                    style={{ resize: 'none', fontSize: '0.8125rem' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Totals Summary */}
          <div className="card" style={{ flex: '1 1 300px', height: 'fit-content', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              4. Quotation Totals
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <span>Subtotal (Base Sum)</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(subtotalSum, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <span>Line Item Discounts</span>
                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>-{formatCurrency(itemsDiscountSum, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '0.625rem' }}>
                <span>Taxable Value</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(subtotalSum - itemsDiscountSum, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <span>Taxes (GST)</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(taxSum, currency)}</span>
              </div>

              {appliedCoupon && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--accent)', fontWeight: 600, borderTop: '1px dashed var(--border)', paddingTop: '0.625rem' }}>
                  <span>Coupon Discount ({appliedCoupon.code})</span>
                  <span>-{formatCurrency(couponDiscountAmount, currency)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Net Estimated Total
                  <HelpIcon text="Final amount the client approves: subtotal − line discounts + GST − coupon discount." />
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {formatCurrency(finalNetTotal, currency)}
                </span>
              </div>
            </div>

            <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                id="save-quote-submit"
                type="submit"
                className="w-full btn btn-primary"
                style={{ padding: '0.625rem 1rem' }}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Save as Draft')}
              </button>
              <Link
                href="/quotes"
                className="w-full btn btn-secondary text-center block"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CreateQuotePage() {
  const { showToast } = useToast();
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', minHeight: '100vh', background: 'var(--background)' }}>
        <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', borderBottom: '2px solid var(--accent)', animation: 'pulse 1.5s infinite' }} />
      </div>
    }>
      <QuoteBuilderForm />
    </Suspense>
  );
}
