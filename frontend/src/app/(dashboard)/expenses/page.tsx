'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useModal } from '@/providers/ModalProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard, Plus, Building2, Search, Filter, X, Eye,
  ExternalLink, Edit2, Trash2, AlertCircle,
  FileText, CheckCircle2, Layers
} from 'lucide-react';
import {
  expenses as expensesApi,
  vendors as vendorsApi,
  projects as projectsApi,
  expenseCategories as expenseCategoriesApi,
  platformSettings,
  Expense,
  Vendor,
  ExpenseCategory,
} from '@/lib/api';
import { FileUpload } from '@/components/ui/FileUpload';
import { getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const EXPENSES_HOWTO = {
  overview: 'Log a business expense, submit it for approval, and track it through to reimbursement. Overhead expenses (no project) route to Finance; project-linked expenses route to that project\'s manager.',
  sections: [
    {
      heading: 'Logging an expense',
      items: [
        'Click "Log Expense" and fill in title, category, amount, and date. Everything else is optional.',
        'Link a project only if the cost should be billed/capitalized against it — leave it blank for general overhead (rent, SaaS subscriptions, etc.).',
        'New expenses save as a Draft. Nothing is sent for approval until you click Submit.',
      ],
    },
    {
      heading: 'Approval workflow',
      items: [
        'Draft → Submitted → Approved → Reimbursed, or Rejected at the Submitted stage.',
        'A rejected expense can be edited and resubmitted.',
        'Only Finance, Directors, the Founder, or (for project-linked expenses) that project\'s manager can approve, reject, or mark an expense reimbursed.',
      ],
    },
    {
      heading: 'Vendors',
      items: [
        'Use "Manage Vendors" to keep a reusable list of merchants — pick one when logging an expense instead of retyping it each time.',
        'A vendor can\'t be deleted while expenses still reference it.',
      ],
    },
  ],
};

export default function ExpensesDashboard() {
  const { confirm, prompt } = useModal();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canCreate = user?.permissions?.includes('expenses.create') ?? false;
  const canEdit = user?.permissions?.includes('expenses.edit') ?? false;
  const canApprove = user?.permissions?.includes('expenses.approve') ?? false;
  const canDelete = user?.permissions?.includes('expenses.delete') ?? false;
  const isApprover = canApprove || user?.roles?.some((r: any) => ['founder', 'director', 'project_manager'].includes(typeof r === 'string' ? r : r?.name || ''));
  const { showToast } = useToast();

  // Workspace state & sticky project context
  const { activeProjectId, getPagePreference, setPagePreference, isLoaded: workspaceLoaded } = useWorkspace();
  const [isInitialized, setIsInitialized] = useState(false);

  // Active view states
  const [activeTab, setActiveTab] = useState<'list' | 'approvals'>('list');

  // Filter states
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Hydrate workspace preferences
  useEffect(() => {
    if (!workspaceLoaded || isInitialized) return;
    const saved = getPagePreference<any>('expenses', null);
    if (saved) {
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.filterCategory != null) setFilterCategory(String(saved.filterCategory));
      if (saved.filterStatus != null) setFilterStatus(String(saved.filterStatus));
      if (saved.filterProject != null) {
        setFilterProject(String(saved.filterProject));
      } else if (activeProjectId) {
        setFilterProject(String(activeProjectId));
      }
      if (saved.searchQuery != null) setSearchQuery(String(saved.searchQuery));
    } else if (activeProjectId) {
      setFilterProject(String(activeProjectId));
    }
    setIsInitialized(true);
  }, [workspaceLoaded, isInitialized, getPagePreference, activeProjectId]);

  // Persist workspace preferences
  useEffect(() => {
    if (!isInitialized) return;
    setPagePreference('expenses', {
      activeTab,
      filterCategory,
      filterStatus,
      filterProject,
      searchQuery,
    });
  }, [
    isInitialized,
    activeTab,
    filterCategory,
    filterStatus,
    filterProject,
    searchQuery,
    setPagePreference,
  ]);

  // Drawer / Modals controllers
  const [showDrawer, setShowDrawer] = useState(false);

  const [pendingEditId, setPendingEditId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const editParam = params.get('edit');
      if (params.get('new') === 'true' || editParam) {
        if (editParam) {
          setPendingEditId(Number(editParam));
        } else {
          setShowDrawer(true);
        }
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    }
  }, []);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);

  // Drawer form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formProject, setFormProject] = useState('');

  // Pre-select sticky project in expense creation drawer
  useEffect(() => {
    if (showDrawer && activeProjectId && !formProject && !editingExpenseId) {
      setFormProject(String(activeProjectId));
    }
  }, [showDrawer, activeProjectId, formProject, editingExpenseId]);
  const [formAmount, setFormAmount] = useState('');
  const [formTax, setFormTax] = useState('');
  const [formCurrency, setFormCurrency] = useState(''); // resolved to the platform default once currencies load
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPaymentMethod, setFormPaymentMethod] = useState('');
  const [formBillable, setFormBillable] = useState(false);
  const [formReceiptUrl, setFormReceiptUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [validationError, setValidationError] = useState('');

  // Vendor Management state
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null);
  const [vFormName, setVFormName] = useState('');
  const [vFormContact, setVFormContact] = useState('');
  const [vFormEmail, setVFormEmail] = useState('');
  const [vFormPhone, setVFormPhone] = useState('');
  const [vFormWebsite, setVFormWebsite] = useState('');
  const [vFormCurrency, setVFormCurrency] = useState('');
  const [vFormNotes, setVFormNotes] = useState('');
  const [vValidationError, setVValidationError] = useState('');

  // ============================================================
  // React Query Calls
  // ============================================================

  const { data: expenses = [], isLoading: isExpensesLoading, isError: expensesError } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const res = await expensesApi.listExpenses({ per_page: 500 });
      const payload = res.data as any;
      const rawList = payload && Array.isArray(payload.data)
        ? payload.data
        : (Array.isArray(payload) ? payload : []);

      return rawList.map((e: any) => ({
        ...e,
        amount: parseFloat(e.amount) || 0,
        is_billable: e.is_billable === true || e.is_billable === 1 || String(e.is_billable) === 'true'
      }));
    }
  });

  const { data: categories = [], isError: categoriesError } = useQuery<ExpenseCategory[]>({
    queryKey: ['expenseCategories'],
    queryFn: async () => {
      const res = await expenseCategoriesApi.list();
      const payload = res.data as any;
      return Array.isArray(payload) ? payload : (payload?.data ?? []);
    },
  });

  const { data: vendors = [], isError: vendorsError } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: async () => {
      const res = await vendorsApi.listVendors();
      const payload = res.data as any;
      if (payload && Array.isArray(payload.data)) {
        return payload.data;
      }
      return Array.isArray(payload) ? payload : [];
    }
  });

  const { data: projects = [], isError: projectsError } = useQuery<any[]>({
    queryKey: ['projects', 'picker'],
    queryFn: async () => {
      const res = await projectsApi.list({ per_page: 200 });
      const payload = res.data as any;
      return Array.isArray(payload) ? payload : (payload?.data ?? []);
    }
  });

  // Platform currency list — same source Quotes/Invoices use, so an expense's
  // currency picker always reflects real currency_ids instead of guessed ones.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await platformSettings.get();
      return res.data as any;
    }
  });

  const activeCurrencies = settings?.currencies?.filter((c: any) => c.is_active) || [];
  const defaultCurrencyId = (activeCurrencies.find((c: any) => c.is_default) || activeCurrencies[0])?.id;

  useEffect(() => {
    if (defaultCurrencyId && formCurrency === '') {
      setFormCurrency(String(defaultCurrencyId));
    }
  }, [defaultCurrencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultCurrencyId && !editingVendorId && vFormCurrency === '') {
      setVFormCurrency(String(defaultCurrencyId));
    }
  }, [defaultCurrencyId, editingVendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadError = expensesError || categoriesError || vendorsError || projectsError;

  // ============================================================
  // Mutation Operations
  // ============================================================

  const createExpenseMutation = useMutation({
    mutationFn: (data: any) => expensesApi.createExpense(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      resetExpenseForm();
      setShowDrawer(false);
    },
    onError: (err: unknown) => {
      // Show the real error — never fake a successful insert, which previously
      // made failed saves look like they worked.
      setValidationError(getApiErrorMessage(err, 'Failed to save expense. Please try again.'));
    }
  });

  const updateExpenseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => expensesApi.updateExpense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      resetExpenseForm();
      setShowDrawer(false);
    },
    onError: (err: unknown) => {
      // Show the real error — never fake a successful update.
      setValidationError(getApiErrorMessage(err, 'Failed to update expense. Please try again.'));
    }
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => expensesApi.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err, 'Failed to delete expense.'), 'error');
    }
  });

  const approveExpenseMutation = useMutation({
    mutationFn: ({ id, action, notes }: { id: number; action: 'approve' | 'reject'; notes?: string }) =>
      action === 'approve' ? expensesApi.approveExpense(id) : expensesApi.rejectExpense(id, notes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      showToast(variables.action === 'approve' ? 'Expense approved.' : 'Expense rejected.', 'success');
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err, 'Failed to update expense status.'), 'error');
    }
  });

  const submitExpenseMutation = useMutation({
    mutationFn: (id: number) => expensesApi.submitExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      showToast('Expense submitted for approval.', 'success');
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err, 'Failed to submit expense for approval.'), 'error');
    }
  });

  // Vendor mutations
  const createVendorMutation = useMutation({
    mutationFn: (data: any) => vendorsApi.createVendor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      resetVendorForm();
    },
    onError: (err) => {
      setVValidationError(getApiErrorMessage(err, 'Failed to create vendor.'));
    }
  });

  const updateVendorMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => vendorsApi.updateVendor(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      resetVendorForm();
    },
    onError: (err) => {
      setVValidationError(getApiErrorMessage(err, 'Failed to update vendor.'));
    }
  });

  const deleteVendorMutation = useMutation({
    mutationFn: (id: number) => vendorsApi.deleteVendor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err, 'Failed to delete vendor.'), 'error');
    }
  });

  // ============================================================
  // Calculations & Filtering
  // ============================================================

  const metrics = useMemo(() => {
    let total = 0;
    let billable = 0;
    let reimbursed = 0;
    let pending = 0;

    expenses.forEach(e => {
      const amt = parseFloat(e.amount as any) || 0;
      total += amt;
      const isBill = !!e.is_billable;
      if (isBill) billable += amt;
      if (e.status === 'reimbursed') reimbursed += amt;
      if (e.status === 'submitted') pending += amt;
    });

    return { total, billable, reimbursed, pending };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (filterCategory && e.category_id !== parseInt(filterCategory)) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterProject && e.project_id !== parseInt(filterProject)) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = e.title.toLowerCase().includes(query);
        const matchesNumber = e.expense_number.toLowerCase().includes(query);
        const matchesVendor = e.vendor?.name.toLowerCase().includes(query);
        const matchesUser = e.submitter?.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesNumber && !matchesVendor && !matchesUser) return false;
      }
      return true;
    });
  }, [expenses, filterCategory, filterStatus, filterProject, searchQuery]);

  // Mirrors the backend's ExpensePolicy::approve() — Finance/Director/Founder,
  // or the managing PM of the linked project. Buttons are hidden rather than
  // shown-then-403 for users with no real authority over a given expense.
  const canApproveExpense = (e: Expense) => {
    if (!user) return false;
    if (user.permissions?.includes('expenses.approve')) return true;
    return !!e.project && e.project.manager_id === user.id;
  };

  const pendingApprovals = useMemo(() => {
    return expenses.filter(e => e.status === 'submitted');
  }, [expenses]);

  // ============================================================
  // Handlers
  // ============================================================

  const resetExpenseForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('');
    setFormVendor('');
    setFormProject(activeProjectId ? String(activeProjectId) : '');
    setFormAmount('');
    setFormTax('');
    setFormCurrency(defaultCurrencyId ? String(defaultCurrencyId) : '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPaymentMethod('');
    setFormBillable(false);
    setFormReceiptUrl('');
    setFormNotes('');
    setValidationError('');
    setEditingExpenseId(null);
  };

  const handleLogExpenseClick = () => {
    resetExpenseForm();
    setShowDrawer(true);
  };

  const handleEditExpense = (e: Expense) => {
    setEditingExpenseId(e.id);
    setFormTitle(e.title);
    setFormDescription(e.description || '');
    setFormCategory(e.category_id.toString());
    setFormVendor(e.vendor_id?.toString() || '');
    setFormProject(e.project_id?.toString() || '');
    setFormAmount(e.amount.toString());
    setFormTax(e.tax_amount != null && !isNaN(Number(e.tax_amount)) ? String(e.tax_amount) : '');
    setFormCurrency(e.currency_id.toString());
    setFormDate(e.expense_date?.split('T')[0] || e.expense_date);
    setFormPaymentMethod(e.payment_method || '');
    setFormBillable(e.is_billable);
    setFormReceiptUrl(e.receipt_url || '');
    setFormNotes(e.notes || '');
    setShowDrawer(true);
  };

  // Deep link support: /expenses?edit={id} (used by the expense detail page's Edit action)
  useEffect(() => {
    if (pendingEditId && expenses.length > 0) {
      const target = expenses.find(e => e.id === pendingEditId);
      if (target) {
        handleEditExpense(target);
      }
      setPendingEditId(null);
    }
  }, [pendingEditId, expenses]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitExpenseForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formCategory || !formAmount || !formDate) {
      setValidationError('Please fill in all required fields (Title, Category, Amount, Date).');
      return;
    }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setValidationError('Amount must be a positive number.');
      return;
    }

    const tax = formTax ? parseFloat(formTax) : null;
    if (tax !== null && (isNaN(tax) || tax < 0)) {
      setValidationError('Tax / GST amount must be zero or a positive number.');
      return;
    }

    const payload = {
      title: formTitle,
      description: formDescription || null,
      category_id: parseInt(formCategory),
      vendor_id: formVendor ? parseInt(formVendor) : null,
      project_id: formProject ? parseInt(formProject) : null,
      amount: amt,
      tax_amount: tax,
      currency_id: parseInt(formCurrency),
      expense_date: formDate,
      payment_method: formPaymentMethod || null,
      is_billable: formBillable,
      receipt_url: formReceiptUrl || null,
      notes: formNotes || null
    };

    if (editingExpenseId) {
      updateExpenseMutation.mutate({ id: editingExpenseId, data: payload });
    } else {
      createExpenseMutation.mutate(payload);
    }
  };

  const handleSubmitForApproval = (id: number) => {
    // Uses the dedicated submit endpoint — the previous partial-update call was
    // rejected by backend validation and the failure was silently swallowed.
    submitExpenseMutation.mutate(id);
  };

  const handleApproveAction = async (id: number, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      // Rejection reason is a real, stored field — approval has no comment field, so we
      // don't prompt for (and silently discard) one there.
      const reason = await prompt({ message: 'Enter the reason for rejecting this expense:' });
      if (reason === null) return;
      approveExpenseMutation.mutate({ id, action, notes: reason || undefined });
      return;
    }
    if (await confirm({ message: 'Approve this expense?' })) {
      approveExpenseMutation.mutate({ id, action });
    }
  };

  // Vendor handlers
  const resetVendorForm = () => {
    setVFormName('');
    setVFormContact('');
    setVFormEmail('');
    setVFormPhone('');
    setVFormWebsite('');
    setVFormCurrency(defaultCurrencyId ? String(defaultCurrencyId) : '');
    setVFormNotes('');
    setVValidationError('');
    setEditingVendorId(null);
  };

  const handleEditVendorClick = (v: Vendor) => {
    setEditingVendorId(v.id);
    setVFormName(v.name);
    setVFormContact(v.contact_name || '');
    setVFormEmail(v.email || '');
    setVFormPhone(v.phone || '');
    setVFormWebsite(v.website || '');
    setVFormCurrency(v.currency_id ? String(v.currency_id) : '');
    setVFormNotes(v.notes || '');
  };

  const handleVendorFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vFormName) {
      setVValidationError('Vendor Name is required.');
      return;
    }
    if (!vFormCurrency) {
      setVValidationError('Billing Currency is required.');
      return;
    }

    const payload = {
      name: vFormName,
      contact_name: vFormContact || null,
      email: vFormEmail || null,
      phone: vFormPhone || null,
      website: vFormWebsite || null,
      currency_id: parseInt(vFormCurrency),
      notes: vFormNotes || null
    };

    if (editingVendorId) {
      updateVendorMutation.mutate({ id: editingVendorId, data: payload });
    } else {
      createVendorMutation.mutate(payload);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>
      
      {/* ── Top Header ── */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Expense Management
            <HelpIcon title="Expense Management" content={{
              what: 'Log business expenses, route them for approval, and track reimbursements — plus a shared vendor directory.',
              why: 'Expenses linked to a project are billable/capitalized cost against that project; expenses with no project are general overhead reviewed by Finance.',
              when: 'Log an expense as soon as you incur it, attach the receipt, then Submit it so the right approver (the project\'s PM, or Finance) can act on it.',
            }} />
          </h1>
          <p className="text-secondary text-sm">
            Track expenses, manage corporate vendors, process project capitalization, and approve team reimbursements.
          </p>
        </div>

        <div className="flex gap-2">
          <HowToUseGuide moduleKey="expenses" title="How Expense Management Works" content={EXPENSES_HOWTO} />

          <button
            onClick={() => setShowVendorModal(true)}
            className="btn btn-secondary"
          >
            <Building2 size={16} /> Manage Vendors
          </button>

          {canCreate && (
            <button
              onClick={handleLogExpenseClick}
              className="btn btn-primary"
            >
              <Plus size={16} /> Log Expense
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem', flexShrink: 0
        }}>
          <AlertCircle size={16} />
          Couldn't load expense data. Check your connection and refresh the page.
        </div>
      )}

      {/* ── Metrics Grid ── */}
      <div className="kpi-grid kpi-grid-4">
        <div className="kpi-card">
          <span className="kpi-label">Total Expenses</span>
          <span className="kpi-value">{formatCurrency(metrics.total)}</span>
          <div className="text-xs text-secondary mt-1">Snapshot value in INR</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Billable to Clients</span>
          <span className="kpi-value">{formatCurrency(metrics.billable)}</span>
          <div className="text-xs text-secondary mt-1">Capitalized/Billable logs</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Reimbursed</span>
          <span className="kpi-value text-success">{formatCurrency(metrics.reimbursed)}</span>
          <div className="text-xs text-secondary mt-1">Paid out to employees</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Awaiting Approval</span>
          <span className="kpi-value text-warning">{formatCurrency(metrics.pending)}</span>
          <div className="text-xs text-secondary mt-1">Submitted in inbox</div>
        </div>
      </div>

      {/* ── Main Desk Navigation Tabs ── */}
      <div className="flex border-b" style={{ gap: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('list')}
          style={{
            padding: '0.625rem 0',
            borderBottom: activeTab === 'list' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'list' ? 600 : 500,
            fontSize: '0.875rem'
          }}
          className="flex items-center gap-2"
        >
          <Layers size={15} />
          Expense Registry ({filteredExpenses.length})
        </button>
        
        {isApprover && (
          <button
            onClick={() => setActiveTab('approvals')}
            style={{
              padding: '0.625rem 0',
              borderBottom: activeTab === 'approvals' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'approvals' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'approvals' ? 600 : 500,
              fontSize: '0.875rem'
            }}
            className="flex items-center gap-2"
          >
            <CheckCircle2 size={15} />
            Approvals Desk ({pendingApprovals.length})
          </button>
        )}
      </div>

      {/* ── Tab Layout Container ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        
        {/* ============================================================
            EXPENSE REGISTRY TAB
            ============================================================ */}
        {activeTab === 'list' && (
          <div className="flex flex-col gap-4">
            
            {/* Filters panel */}
            <div className="card-elevated" style={{ padding: '0.875rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search expense title, number, vendor, submitter..."
                  value={searchQuery ?? ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.8125rem' }}
                />
              </div>

              <Filter size={14} style={{ color: 'var(--text-muted)' }} />

              <select
                value={filterCategory ?? ''}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="form-input"
                style={{ width: '150px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={filterStatus ?? ''}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="form-input"
                style={{ width: '130px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="reimbursed">Reimbursed</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={filterProject ?? ''}
                onChange={(e) => setFilterProject(e.target.value)}
                className="form-input"
                style={{ width: '160px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {(filterCategory || filterStatus || filterProject || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterCategory('');
                    setFilterStatus('');
                    setFilterProject('');
                    setSearchQuery('');
                  }}
                  style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <X size={12} /> Clear Filters
                </button>
              )}
            </div>

            {/* Expense Registry Table */}
            {isExpensesLoading ? (
              <div className="data-table-wrap">
                <SkeletonTable rows={5} cols={8} />
              </div>
            ) : filteredExpenses.length === 0 ? (
              expenses.length === 0 ? (
                <EmptyState
                  title="No expenses logged yet"
                  description="Log your first business expense to start tracking spend and reimbursements."
                  action={canCreate ? <button onClick={handleLogExpenseClick} className="btn btn-primary btn-sm"><Plus size={14} /> Log Expense</button> : undefined}
                />
              ) : (
                <EmptyState
                  title="No expenses match your filters"
                  description="Try clearing the search, category, status, or project filters."
                  action={<button onClick={() => { setFilterCategory(''); setFilterStatus(''); setFilterProject(''); setSearchQuery(''); }} className="btn btn-secondary btn-sm"><X size={14} /> Clear Filters</button>}
                />
              )
            ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Submitter</th>
                    <th>Title & Category</th>
                    <th>Vendor</th>
                    <th>Project Link</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Billable</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Receipt</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e) => {
                    let statusBadge = 'badge-muted';
                    if (e.status === 'reimbursed') statusBadge = 'badge-success';
                    if (e.status === 'approved') statusBadge = 'badge-info';
                    if (e.status === 'submitted') statusBadge = 'badge-warning';
                    if (e.status === 'rejected') statusBadge = 'badge-danger';

                    return (
                      <tr key={e.id}>
                        <td className="font-bold text-xs" style={{ color: 'var(--accent)' }}>{e.expense_number}</td>
                        <td className="text-xs">{formatDate(e.expense_date)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar avatar-sm">
                              {getInitials(e.submitter?.name || '')}
                            </div>
                            <span className="text-xs">{e.submitter?.name || 'Member'}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }} className="text-xs">{e.title}</div>
                          <div style={{ fontSize: '0.6875rem' }} className="text-secondary">
                            {e.category?.name || 'Uncategorized'}
                          </div>
                        </td>
                        <td className="text-xs font-semibold">{e.vendor?.name || '—'}</td>
                        <td className="text-xs text-secondary truncate" style={{ maxWidth: '180px' }}>
                          {e.project?.name || '—'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-bold text-xs">
                          {formatCurrency(e.amount)}
                        </td>
                        <td>
                          <span className={`badge ${e.is_billable ? 'badge-accent' : 'badge-muted'}`} style={{ fontSize: '0.55rem', padding: '1px 5px' }}>
                            {e.is_billable ? 'Billable' : 'Internal'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${statusBadge}`} style={{ fontSize: '0.55rem', padding: '1px 5px' }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {e.receipt_url ? (
                            <a
                              href={e.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'inline-flex', color: '#34A853' }}
                              title="Google Drive Receipt Link"
                            >
                              <FileText size={16} />
                            </a>
                          ) : (
                            <span className="text-secondary text-xs">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {e.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => handleSubmitForApproval(e.id)}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '2px 6px', fontSize: '0.625rem' }}
                                  title="Submit to Approvals desk"
                                >
                                  Submit
                                </button>
                                {(canEdit || e.submitted_by === user?.id) && (
                                  <button
                                    onClick={() => handleEditExpense(e)}
                                    style={{ color: 'var(--text-secondary)' }}
                                    className="hover:text-primary p-1"
                                    title="Edit Expense"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                )}
                                {(canDelete || e.submitted_by === user?.id) && (
                                  <button
                                    onClick={async () => { if (await confirm({ message: 'Delete expense?', variant: 'danger' })) deleteExpenseMutation.mutate(e.id); }}
                                    style={{ color: 'var(--text-muted)' }}
                                    className="hover:text-danger p-1"
                                    title="Delete Expense"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </>
                            )}
                            <Link
                              href={`/expenses/${e.id}`}
                              style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}
                              className="hover:text-primary p-1"
                              title="View Details"
                            >
                              <Eye size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </div>
            )}

          </div>
        )}

        {/* ============================================================
            APPROVALS DESK TAB
            ============================================================ */}
        {activeTab === 'approvals' && (
          <div className="flex flex-col gap-4">
            
            <p className="text-secondary text-xs">
              Review pending reimbursement claims. expenses linked to active clients/projects should be reviewed by Project Managers, while overhead categories route to Finance & Founders.
            </p>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Expense No.</th>
                    <th>Submitter</th>
                    <th>Details</th>
                    <th>Vendor</th>
                    <th>Project</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Approver Routing</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((e) => {
                    const routing = e.project_id ? 'Project Manager (PM)' : 'Finance / Founders';
                    return (
                      <tr key={e.id}>
                        <td className="font-bold text-xs" style={{ color: 'var(--accent)' }}>{e.expense_number}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar avatar-sm">
                              {getInitials(e.submitter?.name || '')}
                            </div>
                            <div>
                              <div className="font-semibold text-xs">{e.submitter?.name}</div>
                              <div className="text-secondary" style={{ fontSize: '0.65rem' }}>{formatDate(e.expense_date)}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="font-semibold text-xs">{e.title}</div>
                          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Category: {e.category?.name}</div>
                          {e.receipt_url && (
                            <a
                              href={e.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent flex items-center gap-1 mt-1 hover:underline"
                              style={{ fontSize: '0.7rem', display: 'inline-flex' }}
                            >
                              <FileText size={10} style={{ color: '#34A853' }} /> View Attachment Receipt
                            </a>
                          )}
                        </td>
                        <td className="text-xs">{e.vendor?.name || '—'}</td>
                        <td className="text-xs text-secondary truncate" style={{ maxWidth: '180px' }}>
                          {e.project?.name || 'General Overheads'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-bold text-xs">
                          {formatCurrency(e.amount)}
                        </td>
                        <td>
                          <span className={`badge ${e.project_id ? 'badge-accent' : 'badge-info'}`} style={{ fontSize: '0.55rem', padding: '1px 5px' }}>
                            {routing}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Link
                              href={`/expenses/${e.id}`}
                              style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}
                              className="hover:text-primary p-1"
                              title="View Full Details"
                            >
                              <Eye size={14} />
                            </Link>
                            {canApproveExpense(e) ? (
                              <>
                                <button
                                  onClick={() => handleApproveAction(e.id, 'reject')}
                                  className="btn btn-danger btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', height: '28px', fontSize: '0.6875rem' }}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleApproveAction(e.id, 'approve')}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', height: '28px', fontSize: '0.6875rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                                >
                                  Approve
                                </button>
                              </>
                            ) : (
                              <span className="text-secondary text-xs" style={{ fontStyle: 'italic' }}>Awaiting {routing}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {pendingApprovals.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No pending expenses awaiting approval.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

      {/* ============================================================
          LOG EXPENSE SLIDING DRAWER
          ============================================================ */}
      {showDrawer && (
        <>
          <div className="overlay" style={{ zIndex: 60 }} onClick={() => setShowDrawer(false)} />
          
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '460px',
              maxWidth: '95%',
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 61,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideInRight 0.2s ease',
            }}
          >
            <div className="modal-header border-b" style={{ padding: '1.25rem' }}>
              <h3 className="modal-title flex items-center gap-2">
                <CreditCard size={18} className="text-accent" />
                {editingExpenseId ? 'Edit Logged Expense' : 'Log Corporate Expense'}
              </h3>
              
              <button
                onClick={() => setShowDrawer(false)}
                className="btn btn-ghost btn-icon p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitExpenseForm} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }} className="flex flex-col gap-4">
                
                {validationError && (
                  <div style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                    <AlertCircle size={14} />
                    <span className="text-xs font-semibold">{validationError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Expense Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. AWS Staging Server, Uber meeting taxi..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="form-input text-xs"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    rows={2}
                    placeholder="What was this expense for?"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="form-input text-xs"
                    style={{ resize: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expense Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="form-input text-xs"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label flex items-center gap-1">
                    Vendor / Merchant
                    <HelpIcon text="Optional — leave blank for costs with no specific merchant (e.g. rent, payroll-adjacent overhead)." />
                  </label>
                  <select
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    className="form-input text-xs"
                  >
                    <option value="">No Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <p className="text-secondary" style={{ fontSize: '0.65rem' }}>
                    Missing a vendor? Close this drawer and click &quot;Manage Vendors&quot;.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Project Association (Optional)</label>
                  <select
                    value={formProject}
                    onChange={(e) => setFormProject(e.target.value)}
                    className="form-input text-xs"
                  >
                    <option value="">No Project Link (Overhead)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 5000"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="form-input text-xs"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      className="form-input text-xs"
                    >
                      {activeCurrencies.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.code} ({c.symbol})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Tax / GST Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 900"
                      value={formTax}
                      onChange={(e) => setFormTax(e.target.value)}
                      className="form-input text-xs"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Payment Method</label>
                    <select
                      value={formPaymentMethod}
                      onChange={(e) => setFormPaymentMethod(e.target.value)}
                      className="form-input text-xs"
                    >
                      <option value="">Not Specified</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="upi">UPI / Net Banking</option>
                      <option value="card">Credit/Debit Card</option>
                      <option value="cash">Cash Payment</option>
                      <option value="cheque">Cheque Payment</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Expense Date *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="form-input text-xs"
                    required
                  />
                </div>

                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                  <input
                    type="checkbox"
                    id="is_billable"
                    checked={formBillable}
                    onChange={(e) => setFormBillable(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                  />
                  <label htmlFor="is_billable" className="form-label cursor-pointer" style={{ marginBottom: 0 }}>
                    Billable to Client (Capitalize cost)
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">Receipt File Upload</label>
                  <FileUpload
                    type="receipt"
                    onUploadComplete={(res) => {
                      setFormReceiptUrl(res.url);
                    }}
                  />
                  {formReceiptUrl && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}>
                      {formReceiptUrl.match(/\.(jpeg|jpg|png|gif|webp)/i) || !formReceiptUrl.endsWith('.pdf') ? (
                        <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src={formReceiptUrl} alt="Receipt Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              const icon = document.createElement('span');
                              icon.innerText = '📄';
                              parent.appendChild(icon);
                            }
                          }} />
                        </div>
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                          📄
                        </div>
                      )}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {formReceiptUrl.split('/').pop()}
                        </div>
                        <a href={formReceiptUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--accent)', textDecoration: 'underline' }}>
                          View Document
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormReceiptUrl('')}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Receipt URL (Direct or Google Drive)</label>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={formReceiptUrl}
                    onChange={(e) => setFormReceiptUrl(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes & Description</label>
                  <textarea
                    rows={3}
                    placeholder="Add purpose description..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="form-input text-xs"
                    style={{ resize: 'none' }}
                  />
                </div>

              </div>

              <div className="modal-footer border-t" style={{ padding: '1rem 1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDrawer(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending}
                  className="btn btn-primary btn-sm"
                >
                  {editingExpenseId ? 'Save Edits' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ============================================================
          MANAGE VENDORS MODAL
          ============================================================ */}
      {showVendorModal && (
        <div className="overlay" style={{ zIndex: 60 }} onClick={() => setShowVendorModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '95%' }}>
            
            <div className="modal-header border-b">
              <h3 className="modal-title flex items-center gap-2">
                <Building2 size={18} className="text-accent" />
                Manage Corporate Vendors
              </h3>
              
              <button
                onClick={() => { setShowVendorModal(false); resetVendorForm(); }}
                className="btn btn-ghost btn-icon p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body flex flex-col gap-4" style={{ padding: '1.25rem' }}>
              
              {/* Form to Create/Edit Vendor */}
              <form onSubmit={handleVendorFormSubmit} className="card-elevated flex flex-col gap-3" style={{ padding: '0.875rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">
                  {editingVendorId ? 'Edit Vendor Details' : 'Add New Vendor'}
                </h4>
                
                {vValidationError && (
                  <p className="text-xs text-danger font-semibold">{vValidationError}</p>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }} className="kpi-grid-6">
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Vendor Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. AWS, Github Inc."
                      value={vFormName}
                      onChange={(e) => setVFormName(e.target.value)}
                      className="form-input text-xs"
                      style={{ padding: '0.375rem 0.5rem', height: '32px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Contact Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Finance Ops"
                      value={vFormContact}
                      onChange={(e) => setVFormContact(e.target.value)}
                      className="form-input text-xs"
                      style={{ padding: '0.375rem 0.5rem', height: '32px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem' }} className="kpi-grid-4">
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Email</label>
                    <input
                      type="email"
                      placeholder="e.g. bills@aws.com"
                      value={vFormEmail}
                      onChange={(e) => setVFormEmail(e.target.value)}
                      className="form-input text-xs"
                      style={{ padding: '0.375rem 0.5rem', height: '32px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 99..."
                      value={vFormPhone}
                      onChange={(e) => setVFormPhone(e.target.value)}
                      className="form-input text-xs"
                      style={{ padding: '0.375rem 0.5rem', height: '32px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Website</label>
                    <input
                      type="text"
                      placeholder="e.g. aws.amazon.com"
                      value={vFormWebsite}
                      onChange={(e) => setVFormWebsite(e.target.value)}
                      className="form-input text-xs"
                      style={{ padding: '0.375rem 0.5rem', height: '32px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Billing Currency *</label>
                    <select
                      value={vFormCurrency}
                      onChange={(e) => setVFormCurrency(e.target.value)}
                      className="form-input text-xs"
                      style={{ padding: '0.375rem 0.5rem', height: '32px' }}
                    >
                      <option value="">Select</option>
                      {activeCurrencies.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.code}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Internal Notes</label>
                  <textarea
                    rows={1}
                    placeholder="AWS cloud staging server subscriptions..."
                    value={vFormNotes}
                    onChange={(e) => setVFormNotes(e.target.value)}
                    className="form-input text-xs"
                    style={{ resize: 'none', padding: '0.375rem 0.5rem' }}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  {editingVendorId && (
                    <button
                      type="button"
                      onClick={resetVendorForm}
                      className="btn btn-secondary btn-sm"
                      style={{ height: '28px', fontSize: '0.7rem' }}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ height: '28px', fontSize: '0.7rem' }}
                  >
                    {editingVendorId ? 'Save Changes' : 'Add Vendor'}
                  </button>
                </div>
              </form>

              {/* Vendors List Table */}
              <div className="data-table-wrap" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vendor Name</th>
                      <th>Contact Person</th>
                      <th>Email / Website</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <div className="font-semibold text-xs text-primary">{v.name}</div>
                          {v.notes && <div className="text-secondary" style={{ fontSize: '0.65rem' }}>{v.notes}</div>}
                        </td>
                        <td className="text-xs">{v.contact_name || '—'}</td>
                        <td>
                          {v.email && <div className="text-xs">{v.email}</div>}
                          {v.website && (
                            <a
                              href={`https://${v.website.replace(/^(https?:\/\/)?(www\.)?/, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent flex items-center gap-1 hover:underline text-xs"
                              style={{ display: 'inline-flex' }}
                            >
                              {v.website} <ExternalLink size={10} />
                            </a>
                          )}
                          {!v.email && !v.website && <span className="text-secondary text-xs">—</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => handleEditVendorClick(v)}
                              style={{ color: 'var(--text-secondary)' }}
                              className="hover:text-primary p-1"
                              title="Edit Vendor"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={async () => { if (await confirm({ message: 'Delete this vendor?', variant: 'danger' })) deleteVendorMutation.mutate(v.id); }}
                              style={{ color: 'var(--text-muted)' }}
                              className="hover:text-danger p-1"
                              title="Delete Vendor"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>

            <div className="modal-footer border-t" style={{ padding: '0.75rem 1.25rem' }}>
              <button
                type="button"
                onClick={() => { setShowVendorModal(false); resetVendorForm(); }}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
