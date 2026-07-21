import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// NEXT_PUBLIC_* vars are inlined at build time — if this is missing in a
// production build, every API call silently targets localhost with no
// build-time error. Warn loudly at runtime so a misconfigured deploy is at
// least visible in the browser console instead of failing silently.
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_API_URL && typeof window !== 'undefined') {
  console.warn(
    '[config] NEXT_PUBLIC_API_URL was not set at build time — falling back to http://localhost:8000/api/v1, which will not work in production.'
  );
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth endpoints must never trigger the global 401 "session expired" redirect:
// a failed login/reset attempt is not an expired session.
const AUTH_ENDPOINTS = ['/auth/login', '/portal/login', '/auth/forgot-password', '/auth/reset-password'];
const isAuthEndpoint = (url?: string) =>
  !!url && AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));

/**
 * Convert any API/network error into an accurate, human-readable message.
 * Distinguishes "server unreachable" from real authentication/validation errors
 * so users are never told their credentials are wrong when the backend is down.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    // No response at all → network problem or backend not running
    if (!err.response) {
      if (
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        (err.message && err.message.toLowerCase().includes('timeout'))
      ) {
        return 'The server took too long to respond. Please try again.';
      }
      return 'Cannot reach the server. Please make sure the backend is running, then try again.';
    }
    const data = err.response.data as
      | { message?: string; errors?: Record<string, string[]> }
      | undefined;
    // Laravel validation errors (422) — surface the first specific error
    const firstValidationError = data?.errors
      ? Object.values(data.errors).flat().find(Boolean)
      : undefined;
    if (firstValidationError) return firstValidationError;
    if (data?.message) return data.message;
    if (err.response.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (err.response.status >= 500) return 'The server encountered an error. Please try again shortly.';
  }
  return fallback;
}

/** Lightweight backend reachability check (used by the login page). */
export function checkBackendHealth(): Promise<boolean> {
  return api
    .get('/health', { timeout: 4000 })
    .then(() => true)
    .catch((err) => !axios.isAxiosError(err) || !!err.response);
}

// Request interceptor — attach Bearer token from localStorage
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 and extract data.data
api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.data !== undefined) {
      // If it contains pagination metadata, keep the envelope so the page can read meta info
      if (
        response.data.meta !== undefined ||
        response.data.links !== undefined ||
        response.data.current_page !== undefined
      ) {
        return response;
      }
      return { ...response, data: response.data.data };
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401 && !isAuthEndpoint(error.config?.url)) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ============================================================
// Types
// ============================================================

export interface User {
  id: number;
  name: string;
  email: string;
  roles: Role[];
  permissions: string[];
  departments: Department[];
  /** Reporting lines (many-to-many, PRD). Empty unless the endpoint loaded them (users show/update do). */
  managers?: Array<{ id: number; name: string }>;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  employee_id?: string;
  phone?: string;
  hourly_rate?: number;
}

export interface RolePermission {
  id: number;
  name: string;
  guard_name: string;
}

export interface Role {
  id: number;
  name: string;
  display_name: string;
  // Optional: lightweight call sites (e.g. the authenticated user's own role
  // badges) never populate these — only the full /roles response does.
  guard_name?: string;
  description?: string | null;
  users_count?: number;
  permissions?: RolePermission[];
  created_at?: string;
  updated_at?: string;
}

export interface Permission {
  id: number;
  name: string;
  guard_name: string;
  description?: string | null;
}

/** GET /permissions returns permissions grouped by module, e.g. { users: [...], clients: [...] }. */
export type PermissionsByModule = Record<string, Permission[]>;

export interface Department {
  id: number;
  name: string;
  color?: string;
  head?: User;
  members_count?: number;
}

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// CRM TYPES
export interface LeadContact {
  id: number;
  lead_id: number;
  name: string;
  designation?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  notes?: string;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LeadStage {
  id: number;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LeadSource {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeadActivity {
  id: number;
  lead_id?: number;
  type: 'call' | 'whatsapp' | 'email' | 'note' | 'meeting' | 'stage_change' | 'assignment_change' | 'system_event' | 'lead_converted';
  description: string;
  occurred_at?: string;
  user?: { id: number; name: string } | null;
  created_at: string;
}

export interface LeadFollowup {
  id: number;
  description: string;
  type: string;
  scheduled_at: string;
  is_completed: boolean;
  completed_at?: string | null;
}

export interface Lead {
  id: number;
  company_name: string;
  website_url?: string;
  timezone?: string;
  expected_start_date?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  temperature: 'cold' | 'warm' | 'hot';
  budget: number;
  estimated_monthly_budget?: number;
  interested_service_ids?: number[];
  is_converted?: boolean;
  converted_client_id?: number | null;
  stage_id: number;
  source_id: number;
  sales_exec_id?: number;
  sales_head_id?: number;
  stage?: LeadStage;
  source?: LeadSource;
  sales_exec?: User;
  sales_head?: User;
  contacts: LeadContact[];
  activities: LeadActivity[];
  followups?: LeadFollowup[];
  created_at: string;
  updated_at: string;
}

export interface LeadListParams {
  page?: number;
  per_page?: number;
  search?: string;
  stage_id?: number;
  source_id?: number;
  sales_exec_id?: number;
  priority?: string;
  temperature?: string;
  min_budget?: number;
  max_budget?: number;
}

export interface CreateLeadData {
  company_name: string;
  website_url?: string;
  timezone?: string;
  expected_start_date?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  temperature: 'cold' | 'warm' | 'hot';
  budget: number;
  interested_service_ids?: number[];
  stage_id: number;
  source_id: number;
  sales_exec_id?: number;
  sales_head_id?: number;
  primary_contact: {
    name: string;
    designation?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  };
  secondary_contacts?: Array<{
    name: string;
    designation?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  }>;
}

export interface UpdateLeadData {
  company_name?: string;
  website_url?: string;
  timezone?: string;
  expected_start_date?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  temperature?: 'cold' | 'warm' | 'hot';
  budget?: number;
  interested_service_ids?: number[];
  stage_id?: number;
  source_id?: number;
  sales_exec_id?: number;
  sales_head_id?: number;
  contacts?: Partial<LeadContact>[];
}

export interface ConvertLeadData {
  quote_title: string;  // backend validates 'quote_title'
  valid_until: string;
  client_id?: number;
}

export interface LogActivityData {
  type: 'call' | 'whatsapp' | 'email' | 'note' | 'meeting' | 'stage_change' | 'assignment_change' | 'system_event';
  description: string;
  due_at?: string;
}

export interface Alert {
  id: number;
  type: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  action_url?: string;
  metadata?: any;
  triggered_by?: number;
  triggerer?: {
    id: number;
    name: string;
    avatar_url?: string;
  };
}

// ============================================================
// Auth API
// ============================================================

export const auth = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  logout: () => api.post('/auth/logout'),

  /** Revokes every session token for the current user (all devices). */
  logoutAll: () => api.post('/auth/logout-all'),

  me: () => api.get<User>('/auth/me'),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { token: string; email: string; password: string; password_confirmation: string }) =>
    api.post('/auth/reset-password', data),

  changePassword: (data: { current_password: string; password: string; password_confirmation: string }) =>
    api.post('/auth/change-password', data),

  loginActivity: (params?: Record<string, any>) =>
    api.get('/auth/login-activity', { params }),
};

// ============================================================
// Users API
// ============================================================

export interface UserListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  department_id?: number;
  role_id?: number;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  employee_id?: string;
  status?: string;
  role_ids?: number[];
  department_ids?: number[];
  /** Reporting lines — ids of the managers this user reports to (first = primary). */
  manager_ids?: number[];
  is_client_portal_user?: boolean;
  hourly_rate?: number;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  phone?: string;
  employee_id?: string;
  status?: string;
  role_ids?: number[];
  department_ids?: number[];
  /** Reporting lines — ids of the managers this user reports to (first = primary). */
  manager_ids?: number[];
  is_client_portal_user?: boolean;
  hourly_rate?: number;
}

export const users = {
  list: (params?: UserListParams) =>
    api.get<{ data: User[]; meta: PaginationMeta }>('/users', { params }),

  show: (id: number) =>
    api.get<{ data: User }>(`/users/${id}`),

  create: (data: CreateUserData) =>
    api.post<User>('/users', data),

  update: (id: number, data: UpdateUserData) =>
    api.put<User>(`/users/${id}`, data),

  delete: (id: number) =>
    api.delete(`/users/${id}`),

  syncRoles: (id: number, roleIds: number[]) =>
    api.put(`/users/${id}/roles`, { role_ids: roleIds }),

  resendInvite: (id: number) =>
    api.post<{ message: string }>(`/users/${id}/resend-invite`),
};

// ============================================================
// Credit Notes API
// ============================================================
export interface CreditNote {
  id: number;
  credit_note_number: string;
  invoice_id: number;
  amount: number;
  reason?: string;
  issue_date: string;
  status: 'draft' | 'issued';
  created_at: string;
  updated_at: string;
}

export interface CreateCreditNoteData {
  invoice_id: number;
  amount: number;
  reason?: string;
  issue_date: string;
}

export interface CreditNoteListParams {
  page?: number;
  per_page?: number;
  invoice_id?: number;
}

export const creditNotes = {
  list: (params?: CreditNoteListParams) =>
    api.get<{ data: CreditNote[]; meta: PaginationMeta }>('/credit-notes', { params }),
  create: (data: CreateCreditNoteData) => api.post<CreditNote>('/credit-notes', data),
};

// ============================================================
// Roles API
// ============================================================

export const roles = {
  list: () => api.get<Role[]>('/roles'),

  create: (data: { name: string; description?: string; permission_ids?: number[] }) =>
    api.post<Role>('/roles', data),

  update: (id: number, data: { name?: string; description?: string }) =>
    api.put<Role>(`/roles/${id}`, data),

  delete: (id: number) =>
    api.delete(`/roles/${id}`),

  syncPermissions: (id: number, permissionIds: number[]) =>
    api.put<Role>(`/roles/${id}/permissions`, { permission_ids: permissionIds }),
};

// ============================================================
// Permissions API
// ============================================================

export const permissions = {
  /** Real shape: grouped by module, e.g. { users: [...], clients: [...] } — not a flat array. */
  list: () => api.get<PermissionsByModule>('/permissions'),
};

// ============================================================
// Departments API
// ============================================================

export interface DepartmentListParams {
  per_page?: number;
  search?: string;
  is_active?: boolean;
}

export interface CreateDepartmentData {
  name: string;
  color?: string;
  head_user_id?: number;
}

export interface UpdateDepartmentData {
  name?: string;
  color?: string;
  head_user_id?: number;
}

export const departments = {
  list: (params?: DepartmentListParams) =>
    api.get<Department[]>('/departments', { params }),

  create: (data: CreateDepartmentData) =>
    api.post<Department>('/departments', data),

  update: (id: number, data: UpdateDepartmentData) =>
    api.put<Department>(`/departments/${id}`, data),

  delete: (id: number) =>
    api.delete(`/departments/${id}`),
};

// ============================================================
// Leads API
// ============================================================

export const leads = {
  list: (params?: LeadListParams) =>
    api.get<{ data: Lead[]; meta: PaginationMeta }>('/leads', { params }),

  create: (data: CreateLeadData) =>
    api.post<Lead>('/leads', data),

  get: (id: number) =>
    api.get<Lead>(`/leads/${id}`),

  update: (id: number, data: UpdateLeadData) =>
    api.put<Lead>(`/leads/${id}`, data),

  delete: (id: number) =>
    api.delete(`/leads/${id}`),

  updateStage: (id: number, stageId: number, notes?: string) =>
    api.patch<Lead>(`/leads/${id}/stage`, { stage_id: stageId, notes }),

  convert: (id: number, data: ConvertLeadData) =>
    api.post<{ quote_id: number }>(`/leads/${id}/convert`, data),

  logActivity: (id: number, data: LogActivityData) =>
    api.post<LeadActivity>(`/leads/${id}/activities`, data),

  completeFollowup: (id: number, followupId: number, completion_notes?: string) =>
    api.patch(`/leads/${id}/followups/${followupId}/complete`, { completion_notes }),
};

// ============================================================
// Lead Stages API
// ============================================================

export const leadStages = {
  list: () =>
    api.get<LeadStage[]>('/lead-stages'),

  create: (data: { name: string; slug: string; color: string; sort_order: number }) =>
    api.post<LeadStage>('/lead-stages', data),

  update: (id: number, data: { name?: string; slug?: string; color?: string; sort_order?: number }) =>
    api.put<LeadStage>(`/lead-stages/${id}`, data),

  delete: (id: number) =>
    api.delete(`/lead-stages/${id}`),
};

// ============================================================
// Lead Sources API
// ============================================================

export const leadSources = {
  list: () =>
    api.get<LeadSource[]>('/lead-sources'),

  create: (data: { name: string; slug: string; color: string; icon?: string }) =>
    api.post<LeadSource>('/lead-sources', data),

  update: (id: number, data: { name?: string; slug?: string; color?: string; icon?: string }) =>
    api.put<LeadSource>(`/lead-sources/${id}`, data),

  delete: (id: number) =>
    api.delete(`/lead-sources/${id}`),
};

// ============================================================
// Alerts API
// ============================================================

export const alerts = {
  list: (params?: { filter?: string; search?: string }) =>
    api.get<Alert[]>('/alerts', { params }),

  markRead: (id: number) =>
    api.post<void>(`/alerts/${id}/read`),

  markAllRead: () =>
    api.post<void>('/alerts/read-all'),

  delete: (id: number) =>
    api.delete<void>(`/alerts/${id}`),

  deleteRead: () =>
    api.delete<void>('/alerts/read'),
};

// ============================================================
// Service Catalog & Quotations API Types
// ============================================================

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Service {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  base_price: number;
  unit: string;
  tax_rate: number;
  category?: ServiceCategory;
  created_at?: string;
  updated_at?: string;
}

export interface Package {
  id: number;
  name: string;
  description?: string;
  /** The final bundled price actually charged (source of truth). */
  price?: number | string;
  /**
   * How `price` was arrived at. Persisted since the Services module audit —
   * null on legacy rows, for which the UI derives a fixed-amount display.
   */
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  currency_id?: number;
  billing_cycle?: string;
  is_active?: boolean;
  services?: Service[];
  service_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface Coupon {
  id: number;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_amount?: number;
  max_discount?: number;
  expires_at?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CouponValidationResponse {
  valid: boolean;
  discount_amount: number;
  final_amount: number;
  message?: string;
}

export interface QuoteItem {
  id?: number;
  quote_id?: number;
  service_id?: number;
  service?: Service;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

export interface QuoteApproval {
  id: number;
  quote_id?: number;
  step_number?: number;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  actioned_at?: string;
  requested_by?: number;
  requester?: { id: number; name: string };
  approver_id?: number;
  approver?: { id: number; name: string };
  // Legacy/mock-data-friendly fields kept optional for display fallbacks
  user_id?: number;
  user?: User;
  step_name?: string;
  created_at: string;
}

export interface Quote {
  id: number;
  quote_number: string;
  lead_id?: number;
  lead?: Lead;
  client_id?: number;
  client?: { id: number; name: string; email: string };
  created_by?: number;
  creator?: { id: number; name: string; email: string };
  title: string;
  description?: string;
  currency_id?: number;
  currency: string | { id: number; code: string; symbol: string; name: string };
  exchange_rate?: number;
  valid_until: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  coupon_id?: number;
  coupon?: { id: number; code: string; type: string; value: number };
  coupon_discount?: number;
  coupon_code?: string;
  issue_date?: string;
  terms_conditions?: string;
  internal_notes?: string;
  client_notes?: string;
  items: QuoteItem[];
  approvals?: QuoteApproval[];
  created_at: string;
  updated_at: string;
}

export interface QuoteListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  lead_id?: number;
}

export interface CreateQuoteData {
  lead_id?: number;
  client_id?: number;
  title: string;
  currency_id: number;
  currency?: string;
  valid_until: string;
  coupon_code?: string;
  terms_conditions?: string;
  internal_notes?: string;
  items: Array<{
    service_id?: number;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    tax_rate: number;
  }>;
}

export interface UpdateQuoteData extends Partial<CreateQuoteData> {
  status?: Quote['status'];
}

// ============================================================
// Service Categories API
// ============================================================
export const serviceCategories = {
  list: () => api.get<ServiceCategory[]>('/service-categories'),
  create: (data: Partial<ServiceCategory>) => api.post<ServiceCategory>('/service-categories', data),
  update: (id: number, data: Partial<ServiceCategory>) => api.put<ServiceCategory>(`/service-categories/${id}`, data),
  delete: (id: number) => api.delete(`/service-categories/${id}`),
};

// ============================================================
// Services API
// ============================================================
export const services = {
  list: (params?: { category_id?: number; search?: string }) =>
    api.get<Service[]>('/services', { params }),
  create: (data: Partial<Service>) => api.post<Service>('/services', data),
  update: (id: number, data: Partial<Service>) => api.put<Service>(`/services/${id}`, data),
  delete: (id: number) => api.delete(`/services/${id}`),
};

// ============================================================
// Packages API
// ============================================================
export const packages = {
  list: () => api.get<Package[]>('/packages'),
  create: (data: Partial<Package> & { service_ids?: number[] }) => api.post<Package>('/packages', data),
  update: (id: number, data: Partial<Package> & { service_ids?: number[] }) => api.put<Package>(`/packages/${id}`, data),
  delete: (id: number) => api.delete(`/packages/${id}`),
};

// ============================================================
// Coupons API
// ============================================================
// Backend columns are type/value/minimum_amount/maximum_discount/valid_until —
// translate to/from the frontend's discount_type/discount_value naming so both
// directions of the contract work.
function mapCouponFromBackend(c: any): Coupon {
  if (!c) return c;
  return {
    ...c,
    discount_type: c.discount_type ?? c.type,
    discount_value: c.discount_value !== undefined ? parseFloat(c.discount_value) : parseFloat(c.value),
    min_amount: c.min_amount ?? (c.minimum_amount !== undefined ? parseFloat(c.minimum_amount) : undefined),
    max_discount: c.max_discount ?? (c.maximum_discount !== undefined ? parseFloat(c.maximum_discount) : undefined),
    expires_at: c.expires_at ?? c.valid_until,
  };
}

function mapCouponToBackend(d: Partial<Coupon>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d };
  if (out.type === undefined && d.discount_type !== undefined) out.type = d.discount_type;
  if (out.value === undefined && d.discount_value !== undefined) out.value = d.discount_value;
  if (out.minimum_amount === undefined && d.min_amount !== undefined) out.minimum_amount = d.min_amount;
  if (out.maximum_discount === undefined && d.max_discount !== undefined) out.maximum_discount = d.max_discount;
  if (out.valid_until === undefined && d.expires_at !== undefined) out.valid_until = d.expires_at;
  delete out.discount_type; delete out.discount_value;
  delete out.min_amount; delete out.max_discount; delete out.expires_at;
  return out;
}

export const coupons = {
  list: async () => {
    const res = await api.get<Coupon[]>('/discount-coupons');
    if (Array.isArray(res.data)) res.data = res.data.map(mapCouponFromBackend);
    return res;
  },
  create: async (data: Partial<Coupon>) => {
    const res = await api.post<Coupon>('/discount-coupons', mapCouponToBackend(data));
    if (res.data) res.data = mapCouponFromBackend(res.data);
    return res;
  },
  update: async (id: number, data: Partial<Coupon>) => {
    const res = await api.put<Coupon>(`/discount-coupons/${id}`, mapCouponToBackend(data));
    if (res.data) res.data = mapCouponFromBackend(res.data);
    return res;
  },
  delete: (id: number) => api.delete(`/discount-coupons/${id}`),
  validate: (code: string, amount: number) =>
    api.get<CouponValidationResponse>(`/discount-coupons/${code}/validate`, { params: { amount } }),
};

// ============================================================
// Quotes API
// ============================================================
export const quotes = {
  list: (params?: QuoteListParams) =>
    api.get<{ data: Quote[]; meta: PaginationMeta }>('/quotes', { params }),
  get: (id: number) => api.get<Quote>(`/quotes/${id}`),
  create: (data: CreateQuoteData) => api.post<Quote>('/quotes', data),
  update: (id: number, data: UpdateQuoteData) => api.put<Quote>(`/quotes/${id}`, data),
  delete: (id: number) => api.delete(`/quotes/${id}`),
  submitApproval: (id: number) => api.post<Quote>(`/quotes/${id}/submit-approval`),
  approve: (id: number, comments?: string) => api.post<Quote>(`/quotes/${id}/approve`, { comments }),
  reject: (id: number, comments?: string) => api.post<Quote>(`/quotes/${id}/reject`, { comments }),
  send: (id: number) => api.post<void>(`/quotes/${id}/send`),
  // Backend route is /quotes/{id}/download-pdf (NOT /pdf — that route was removed as it only returned HTML)
  downloadPdf: (id: number) => api.get<Blob>(`/quotes/${id}/download-pdf`, { responseType: 'blob', timeout: 90000 }),
};

// ============================================================
// Invoices & Payments API Types
// ============================================================

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  service_id?: number;
  service?: Service;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  invoice?: Invoice;
  payment_number: string;
  amount: number;
  payment_method: 'bank_transfer' | 'card' | 'upi' | 'cash' | 'cheque';
  transaction_reference?: string;
  payment_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// The invoice detail endpoint exposes `approvals` (with actor + notes)
// for the approval-history timeline.
export interface InvoiceApproval {
  id: number;
  invoice_id: number;
  action?: string;
  actor_id?: number;
  actor?: { id: number; name: string };
  notes?: string;
  // Legacy/mock-data-friendly fields kept optional for display fallbacks
  user_name?: string;
  role?: string;
  status?: 'pending' | 'approved' | 'rejected';
  comments?: string;
  actioned_at?: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  quote_id?: number;
  quote?: { id: number; quote_number: string; title: string };
  lead_id?: number;
  lead?: Lead;
  client_id: number;
  client?: { id: number; name: string; email: string };
  created_by?: number;
  creator?: { id: number; name: string; email: string };
  recurring_rule_id?: number;
  title: string;
  description?: string;
  currency_id?: number;
  currency: string | { id: number; code: string; symbol: string; name: string };
  exchange_rate?: number;
  base_currency?: string;
  issue_date: string;
  due_date: string;
  status: 'draft' | 'pending_review' | 'pending_approval' | 'approved' | 'sent' | 'paid' | 'partially_paid' | 'overdue' | 'void' | 'cancelled';
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  coupon_id?: number;
  coupon?: { id: number; code: string; type: string; value: number };
  coupon_discount?: number;
  coupon_code?: string;
  paid_amount: number;
  due_amount: number;
  terms_conditions?: string;
  client_notes?: string;
  internal_notes?: string;
  is_recurring?: boolean;
  recurring_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurring_end_date?: string;
  items: InvoiceItem[];
  payments?: Payment[];
  approvals?: InvoiceApproval[];
  created_at: string;
  updated_at: string;
}

export interface InvoiceListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  lead_id?: number;
}

export interface CreateInvoiceData {
  quote_id?: number;
  lead_id?: number;
  client_id: number;
  currency_id: number;
  base_currency?: string;
  exchange_rate?: number;
  title: string;
  description?: string;
  issue_date: string;
  due_date: string;
  terms_conditions?: string;
  internal_notes?: string;
  client_notes?: string;
  coupon_code?: string;
  coupon_id?: number;
  is_recurring?: boolean;
  recurring_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurring_end_date?: string;
  items: Array<{
    service_id?: number;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    discount_percent: number;
  }>;
}

export interface UpdateInvoiceData extends Partial<CreateInvoiceData> {
  status?: Invoice['status'];
}

export interface CreatePaymentData {
  invoice_id: number;
  amount: number;
  payment_method: 'bank_transfer' | 'card' | 'upi' | 'cash' | 'cheque';
  transaction_reference?: string;
  payment_date: string;
  notes?: string;
}

export interface PaymentListParams {
  page?: number;
  per_page?: number;
  search?: string;
  invoice_id?: number;
}

// ============================================================
// Invoices API
// ============================================================
export const invoices = {
  list: (params?: InvoiceListParams) =>
    api.get<{ data: Invoice[]; meta: PaginationMeta }>('/invoices', { params }),
  get: (id: number) => api.get<Invoice>(`/invoices/${id}`),
  create: (data: CreateInvoiceData) => api.post<Invoice>('/invoices', data),
  update: (id: number, data: UpdateInvoiceData) => api.put<Invoice>(`/invoices/${id}`, data),
  delete: (id: number) => api.delete(`/invoices/${id}`),
  submitApproval: (id: number, notes?: string) => api.post<Invoice>(`/invoices/${id}/submit-approval`, { notes }),
  review: (id: number, notes?: string) => api.post<Invoice>(`/invoices/${id}/review`, { notes }),
  approve: (id: number, notes?: string) => api.post<Invoice>(`/invoices/${id}/approve`, { notes }),
  reject: (id: number, notes?: string) => api.post<Invoice>(`/invoices/${id}/reject`, { notes }),
  send: (id: number) => api.post<void>(`/invoices/${id}/send`),
  // Backend route is /invoices/{id}/download-pdf (NOT /pdf — that 404s)
  downloadPdf: (id: number) => api.get<Blob>(`/invoices/${id}/download-pdf`, { responseType: 'blob', timeout: 90000 }),
  recordPayment: (id: number, data: any) => api.post<Payment>(`/invoices/${id}/payments`, data),
};

// ============================================================
// Payments API
// ============================================================
export const payments = {
  list: (params?: PaymentListParams) =>
    api.get<{ data: Payment[]; meta: PaginationMeta }>('/payments', { params }),
  // There is no GET /payments/{id} route — nothing needs a single-payment
  // fetch (decided in the cross-cutting audit). There is also no POST
  // /payments route — payments are recorded against an invoice.
  create: (data: CreatePaymentData) =>
    api.post<Payment>(`/invoices/${data.invoice_id}/payments`, data),
  delete: (id: number) => api.delete(`/payments/${id}`),
};

// ============================================================
// Sprint 5 API Types & Implementations
// ============================================================

export interface ProjectMember {
  id: number;
  project_id: number;
  user_id: number;
  role: 'manager' | 'lead' | 'member' | 'viewer';
  department_id?: number | null;
  joined_at?: string;
  user?: { id: number; name: string; email: string } | null;
  department?: { id: number; name: string } | null;
}

export interface Project {
  id: number;
  project_number: string;
  name: string;
  client_id?: number;
  client?: { id: number; name: string; email: string } | null;
  invoice_id?: number;
  invoice?: { id: number; invoice_number: string } | null;
  manager_id?: number;
  manager?: { id: number; name: string; email: string } | null;
  status: 'planning' | 'in_progress' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  completion_percentage: number;
  start_date: string;
  end_date: string;
  budget_hours: number;
  /** Client-computed from budget_amount (backend sends this as a decimal string). */
  budget: number;
  budget_amount?: number;
  description?: string;
  members?: ProjectMember[];
  /** Retainer flag - recurring projects can link a task template for monthly auto-generation. */
  is_recurring?: boolean;
  task_template_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Task {
  id: number;
  task_number?: string;
  project_id: number;
  project?: Project;
  project_name?: string;
  parent_task_id?: number | null;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** Backend field name — do not rename to assignee_id, the API doesn't recognize that key. */
  assigned_to?: number | null;
  assignee?: User;
  assignee_name?: string;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  completion_percentage: number;
  tags?: string[];
  /** ISO timestamp while the timer is running, null when paused/idle. */
  timer_started_at?: string | null;
  /** Seconds banked from previous run segments (excludes the currently running one). */
  timer_accumulated_seconds?: number;
  comments_count?: number;
  time_logged?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  user?: User;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

export interface TaskAttachment {
  id: number;
  task_id: number;
  uploaded_by: number;
  uploader?: User;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocument {
  id: number;
  project_id: number;
  uploaded_by: number;
  uploader?: User;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface Timesheet {
  id: number;
  user_id: number;
  user?: User;
  user_name?: string;
  project_id: number;
  project?: Project;
  project_name?: string;
  task_id?: number;
  task?: Task;
  task_title?: string;
  date: string;
  hours: number;
  description?: string;
  billable: boolean;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approved_by_id?: number;
  rejected_notes?: string;
  submitted_at?: string;
  created_at?: string;
  updated_at?: string;
}

export function mapTimesheetBackendToFrontend(t: any): Timesheet {
  if (!t) return t;
  return {
    ...t,
    hours: parseFloat(t.hours_logged) || parseFloat(t.hours) || 0,
    billable: t.is_billable !== undefined ? !!t.is_billable : (t.billable !== undefined ? !!t.billable : true)
  };
}

export function mapTimesheetFrontendToBackend(t: any): any {
  if (!t) return t;
  const { hours, billable, ...rest } = t;
  const result: any = { ...rest };
  if (hours !== undefined) {
    result.hours_logged = parseFloat(hours) || 0;
  }
  if (billable !== undefined) {
    result.is_billable = !!billable;
  }
  return result;
}

export interface ProjectProfitability {
  project_id: number;
  project_name: string;
  budget_amount: number;
  revenue: number;
  labor_cost: number;
  expense_cost: number;
  total_cost: number;
  net_profit: number;
  margin_percentage: number;
}

export interface Milestone {
  id: number;
  project_id: number;
  name: string;
  description?: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completion_percentage: number;
  sort_order?: number;
}

export const projects = {
  list: (params?: any) => api.get<{ data: Project[]; meta?: PaginationMeta }>('/projects', { params }),
  get: (id: number) => api.get<Project>(`/projects/${id}`),
  create: (data: any) => api.post<Project>('/projects', data),
  update: (id: number, data: any) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  addMember: (id: number, data: { user_id: number; role?: string }) => api.post<void>(`/projects/${id}/members`, data),
  removeMember: (id: number, userId: number) => api.delete<void>(`/projects/${id}/members/${userId}`),
  profitability: (id: number) => api.get<ProjectProfitability>(`/projects/${id}/profitability`),
  milestones: (id: number) => api.get<Milestone[]>(`/projects/${id}/milestones`),
  createMilestone: (id: number, data: Partial<Milestone>) => api.post<Milestone>(`/projects/${id}/milestones`, data),
  updateMilestone: (milestoneId: number, data: Partial<Milestone>) => api.put<Milestone>(`/milestones/${milestoneId}`, data),
  deleteMilestone: (milestoneId: number) => api.delete(`/milestones/${milestoneId}`),
  timesheets: async (id: number) => {
    const res = await api.get<Timesheet[]>(`/projects/${id}/timesheets`);
    if (res.data && Array.isArray(res.data)) {
      res.data = res.data.map(mapTimesheetBackendToFrontend);
    }
    return res;
  },
  tasks: (id: number) => api.get<Task[]>(`/projects/${id}/tasks`),
  listDocuments: (id: number) => api.get<ProjectDocument[]>(`/projects/${id}/documents`),
  addDocument: (id: number, data: { filename: string; file_path: string; file_size?: number; mime_type?: string }) => api.post<ProjectDocument>(`/projects/${id}/documents`, data),
  deleteDocument: (id: number, documentId: number) => api.delete(`/projects/${id}/documents/${documentId}`),
};

export interface TaskListParams {
  page?: number;
  per_page?: number;
  status?: string;
  priority?: string;
  project_id?: number | null;
  assigned_to?: number | null;
  department_id?: number | null;
  search?: string;
  parent_task_id?: number | null;
}

export const tasks = {
  list: (params?: TaskListParams) => api.get<{ data: Task[]; meta?: PaginationMeta }>('/tasks', { params }),
  get: (id: number) => api.get<Task>(`/tasks/${id}`),
  create: (data: any) => api.post<Task>('/tasks', data),
  update: (id: number, data: any) => api.put<Task>(`/tasks/${id}`, data),
  delete: (id: number) => api.delete(`/tasks/${id}`),
  updateStatus: (id: number, status: Task['status']) => api.patch<Task>(`/tasks/${id}/status`, { status }),
  updateCompletion: (id: number, pct: number) => api.patch<Task>(`/tasks/${id}/completion`, { completion_percentage: pct }),
  addComment: (id: number, data: { comment: string; is_internal: boolean }) => api.post<TaskComment>(`/tasks/${id}/comments`, data),
  listComments: (id: number) => api.get<TaskComment[]>(`/tasks/${id}/comments`),
  logTime: async (id: number, data: { date: string; hours: number; description?: string; billable: boolean }) => {
    const backendData = {
      date: data.date,
      hours_logged: data.hours,
      description: data.description,
      is_billable: data.billable
    };
    const res = await api.post<Timesheet>(`/tasks/${id}/time-log`, backendData);
    if (res.data) {
      res.data = mapTimesheetBackendToFrontend(res.data);
    }
    return res;
  },
  startTimer: (id: number) => api.post<Task>(`/tasks/${id}/timer/start`),
  pauseTimer: (id: number) => api.post<Task>(`/tasks/${id}/timer/pause`),
  stopTimer: (id: number) => api.post<Task>(`/tasks/${id}/timer/stop`),
  completeTimer: (id: number) => api.post<Task>(`/tasks/${id}/timer/complete`),
  resetTimer: (id: number) => api.post<Task>(`/tasks/${id}/timer/reset`),
  listAttachments: (id: number) => api.get<TaskAttachment[]>(`/tasks/${id}/attachments`),
  addAttachment: (id: number, data: { filename: string; file_path: string; file_size?: number; mime_type?: string }) => api.post<TaskAttachment>(`/tasks/${id}/attachments`, data),
  deleteAttachment: (id: number, attachmentId: number) => api.delete(`/tasks/${id}/attachments/${attachmentId}`),
};

export const userPreferences = {
  get: () => api.get<{ data: Record<string, any> }>('/user/preferences'),
  update: (preferences: Record<string, any>) => api.put<{ message: string; data: Record<string, any> }>('/user/preferences', { preferences }),
};

export const timesheets = {
  // /timesheets never paginates (backend uses ->get(), not ->paginate()), so the response
  // interceptor always unwraps it to a flat array — unlike /projects or /tasks, which stay
  // wrapped in {data, meta}. Callers should read `res.data` directly, not `res.data.data`.
  list: async (params?: any) => {
    const res = await api.get<Timesheet[]>('/timesheets', { params });
    if (Array.isArray(res.data)) {
      res.data = res.data.map(mapTimesheetBackendToFrontend);
    }
    return res;
  },
  create: async (data: any) => {
    const backendData = mapTimesheetFrontendToBackend(data);
    const res = await api.post<Timesheet>('/timesheets', backendData);
    if (res.data) {
      res.data = mapTimesheetBackendToFrontend(res.data);
    }
    return res;
  },
  update: async (id: number, data: any) => {
    const backendData = mapTimesheetFrontendToBackend(data);
    const res = await api.put<Timesheet>(`/timesheets/${id}`, backendData);
    if (res.data) {
      res.data = mapTimesheetBackendToFrontend(res.data);
    }
    return res;
  },
  delete: (id: number) => api.delete(`/timesheets/${id}`),
  submit: async (id: number) => {
    const res = await api.post<Timesheet>(`/timesheets/${id}/submit`);
    if (res.data) {
      res.data = mapTimesheetBackendToFrontend(res.data);
    }
    return res;
  },
  approve: async (id: number) => {
    const res = await api.post<Timesheet>(`/timesheets/${id}/approve`);
    if (res.data) {
      res.data = mapTimesheetBackendToFrontend(res.data);
    }
    return res;
  },
  reject: async (id: number, notes: string) => {
    const res = await api.post<Timesheet>(`/timesheets/${id}/reject`, { notes });
    if (res.data) {
      res.data = mapTimesheetBackendToFrontend(res.data);
    }
    return res;
  },
  pending: async () => {
    const res = await api.get<Timesheet[]>('/timesheets/pending');
    if (res.data && Array.isArray(res.data)) {
      res.data = res.data.map(mapTimesheetBackendToFrontend);
    }
    return res;
  },
};

// ============================================================
// Sprint 6 API Types & Implementations
// ============================================================

export interface Vendor {
  id: number;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  currency_id: number;
  notes?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseAttachment {
  id: number;
  expense_id: number;
  title: string;
  url: string;
  type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseTimelineEntry {
  id: number;
  event: string;
  user_id?: number;
  user?: { id: number; name: string; email?: string };
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  created_at: string;
}

export interface Expense {
  id: number;
  expense_number: string;
  category_id: number;
  category?: ExpenseCategory;
  project_id?: number;
  project?: Project;
  vendor_id?: number;
  vendor?: Vendor;
  submitted_by: number;
  submitter?: User;
  approved_by?: number;
  approver?: User;
  title: string;
  description?: string;
  amount: number;
  tax_amount?: number;
  currency_id: number;
  currency_code?: string;
  currency?: { id: number; code: string; symbol?: string; name?: string };
  expense_date: string;
  receipt_url?: string;
  payment_method?: 'bank_transfer' | 'card' | 'upi' | 'cash' | 'cheque';
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';
  is_billable: boolean;
  notes?: string;
  rejection_reason?: string;
  attachments?: ExpenseAttachment[];
  created_at?: string;
  updated_at?: string;
}

export interface PayrollRun {
  id: number;
  run_number: string;
  year: number;
  month: number;
  status: 'draft' | 'submitted' | 'approved' | 'processed' | 'paid';
  submitted_by: number;
  submitter?: User;
  approved_by?: number;
  approver?: User;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  currency_id: number;
  approved_at?: string;
  processed_at?: string;
  notes?: string;
  items?: PayrollRunItem[];
  created_at?: string;
  updated_at?: string;
}

export interface PayrollRunItem {
  id: number;
  payroll_run_id: number;
  user_id: number;
  user?: User;
  payroll_run?: { id: number; run_number: string; year: number; month: number; status: PayrollRun['status'] };
  base_salary: number;
  bonus_amount: number;
  deductions: number;
  net_salary: number;
  hours_logged: number;
  expected_hours: number;
  utilization_rate: number;
  breakdown?: {
    compensation_type?: string;
    base?: number;
    hourly_rate?: number;
    bonuses?: Array<{ type: string; amount: number; reason?: string }>;
    deductions?: Array<{ description: string; amount: number }>;
  };
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeCompensation {
  id: number;
  user_id: number;
  user?: User;
  compensation_type_id: number;
  compensation_type?: { id: number; name: string; type: string };
  base_amount: number;
  currency_id: number;
  expected_monthly_hours: number;
  hourly_rate: number;
  tds_percent?: number;
  pf_percent?: number;
  esi_percent?: number;
  effective_from: string;
  effective_until?: string;
  is_current: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Bonus {
  id: number;
  user_id: number;
  user?: User;
  payroll_run_id?: number;
  approved_by?: number;
  amount: number;
  currency_id: number;
  type: 'performance' | 'festival' | 'referral';
  reason?: string;
  effective_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  created_at?: string;
  updated_at?: string;
}

export interface ProjectCostAllocation {
  project_id: number;
  project_name: string;
  project_number?: string;
  total_hours: number;
  total_labor_cost: number;
  breakdown?: Array<{ user_id: number; user_name: string; hours_logged: number; hourly_rate: number; cost: number }>;
}

export const payroll = {
  listRuns: (params?: { per_page?: number }) => api.get<LaravelPaginatedResponse<PayrollRun>>('/payroll/runs', { params }),
  generateRun: (data: { year: number; month: number; notes?: string }) => api.post<PayrollRun>('/payroll/runs', data),
  getRunDetails: (id: number) => api.get<PayrollRun>(`/payroll/runs/${id}`),
  approveRun: (id: number, notes?: string) => api.post<{ message: string; payroll_run: PayrollRun }>(`/payroll/runs/${id}/approve`, { notes }),
  costAllocation: (params?: { year?: number; month?: number }) => api.get<ProjectCostAllocation[]>('/payroll/cost-allocation', { params }),
  myHistory: (params?: { per_page?: number }) => api.get<LaravelPaginatedResponse<PayrollRunItem>>('/payroll/my-history', { params }),
  downloadPayslip: (itemId: number) => api.get<Blob>(`/payroll/items/${itemId}/download-payslip`, { responseType: 'blob', timeout: 90000 }),
  exportRun: (runId: number, format: 'csv' | 'pdf') => api.get<Blob>(`/payroll/runs/${runId}/export`, { params: { format }, responseType: 'blob', timeout: 90000 }),
  deleteRun: (id: number) => api.delete<{ message: string }>(`/payroll/runs/${id}`),
};

export const compensationTypesApi = {
  list: () => api.get<{ data: CompensationType[] }>('/compensation-types'),
};

export interface CompensationType {
  id: number;
  name: string;
  type: 'fixed' | 'hourly' | 'hybrid';
  description?: string;
}

export const employeeCompensationApi = {
  list: (params?: { user_id?: number }) => api.get<{ data: EmployeeCompensation[] }>('/employee-compensations', { params }),
  create: (data: {
    user_id: number;
    compensation_type_id: number;
    base_amount: number;
    currency_id: number;
    expected_monthly_hours?: number;
    hourly_rate?: number;
    tds_percent?: number;
    pf_percent?: number;
    esi_percent?: number;
    effective_from: string;
    notes?: string;
  }) => api.post<EmployeeCompensation>('/employee-compensations', data),
  update: (id: number, data: Partial<Pick<EmployeeCompensation, 'base_amount' | 'hourly_rate' | 'expected_monthly_hours' | 'tds_percent' | 'pf_percent' | 'esi_percent' | 'notes'>>) =>
    api.put<EmployeeCompensation>(`/employee-compensations/${id}`, data),
};

export const bonusApi = {
  list: (params?: { status?: string; user_id?: number; per_page?: number }) => api.get<{ data: LaravelPaginatedResponse<Bonus> }>('/bonuses', { params }),
  create: (data: { user_id: number; amount: number; type: Bonus['type']; reason?: string; effective_date: string; currency_id?: number }) =>
    api.post<Bonus>('/bonuses', data),
  approve: (id: number) => api.post<Bonus>(`/bonuses/${id}/approve`),
  reject: (id: number) => api.post<Bonus>(`/bonuses/${id}/reject`),
};

export const expenses = {
  listExpenses: (params?: any) => api.get<{ data: Expense[]; meta?: PaginationMeta }>('/expenses', { params }),
  getExpense: (id: number) => api.get<Expense>(`/expenses/${id}`),
  createExpense: (data: any) => api.post<Expense>('/expenses', data),
  updateExpense: (id: number, data: any) => api.put<Expense>(`/expenses/${id}`, data),
  deleteExpense: (id: number) => api.delete(`/expenses/${id}`),
  approveExpense: (id: number) => api.post<{ message: string; expense: Expense }>(`/expenses/${id}/approve`),
  // Backend expects `rejection_reason`; the previous `{ notes }` payload silently dropped the reason.
  rejectExpense: (id: number, reason?: string) => api.post<{ message: string; expense: Expense }>(`/expenses/${id}/reject`, { rejection_reason: reason }),
  submitExpense: (id: number) => api.post<{ message: string; expense: Expense }>(`/expenses/${id}/submit`),
  reimburseExpense: (id: number) => api.post<{ message: string; expense: Expense }>(`/expenses/${id}/reimburse`),
  getExpenseTimeline: (id: number) => api.get<{ data: ExpenseTimelineEntry[] }>(`/expenses/${id}/timeline`),
  downloadExpensePdf: (id: number) => api.get<Blob>(`/expenses/${id}/download-pdf`, { responseType: 'blob', timeout: 90000 }),
};

export const expenseCategories = {
  list: () => api.get<ExpenseCategory[]>('/expense-categories'),
};

export const vendors = {
  listVendors: (params?: any) => api.get<{ data: Vendor[]; meta?: PaginationMeta }>('/vendors', { params }),
  createVendor: (data: any) => api.post<Vendor>('/vendors', data),
  updateVendor: (id: number, data: any) => api.put<Vendor>(`/vendors/${id}`, data),
  deleteVendor: (id: number) => api.delete(`/vendors/${id}`),
};

// ============================================================
// Sprint 7 — Client Portal API Types & Implementations
// ============================================================

export interface PortalLoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface PortalProject {
  id: number;
  project_number: string;
  name: string;
  description?: string;
  client_id: number;
  invoice_id?: number;
  manager_id?: number;
  status: string;
  start_date?: string;
  end_date?: string;
  budget_hours?: number;
  budget_amount?: number;
  completion_percentage: number;
  is_recurring: boolean;
  milestones_count: number;
  tasks_count: number;
  budget_used_hours: number;
  /** The client's account manager — loaded on the portal project detail endpoint. */
  manager?: { id: number; name: string; email?: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface PortalMilestone {
  id: number;
  project_id: number;
  name: string;
  description?: string;
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completion_percentage: number;
  sort_order: number;
}

export interface PortalTask {
  id: number;
  task_number: string;
  project_id: number;
  milestone_id?: number;
  parent_task_id?: number;
  title: string;
  description?: string;
  assigned_to?: number;
  assignee_name?: string;
  status: 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  completion_percentage: number;
}

export interface PortalInvoice {
  id: number;
  invoice_number: string;
  title: string;
  client_id: number;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  issue_date: string;
  due_date: string;
  currency?: { code: string; symbol: string; name: string };
  created_at?: string;
}

// Portal-specific axios instance that reads client_token from localStorage
const portalApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});
portalApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('client_token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
portalApi.interceptors.response.use(
  (response) => {
    if (response.data && response.data.data !== undefined) {
      // Some portal endpoints return sibling keys alongside `data` —
      // e.g. `{ data, milestones }` (project detail) or `{ data, meta, links }`
      // (paginated lists). Only collapse to the bare resource when `data` is
      // the sole (or only-with-`message`) key, so those siblings survive.
      const siblingKeys = Object.keys(response.data).filter((k) => k !== 'data' && k !== 'message');
      if (siblingKeys.length > 0) {
        return response;
      }
      return { ...response, data: response.data.data };
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && !isAuthEndpoint(error.config?.url)) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/portal/login') {
        localStorage.removeItem('client_token');
        localStorage.removeItem('client_user');
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(error);
  }
);

export { portalApi };

export const portal = {
  /** Authenticate a client user and receive a token. */
  login: (email: string, password: string) =>
    portalApi.post<PortalLoginResponse>('/portal/login', { email, password }),

  /** List all projects owned by the authenticated client. */
  getProjects: (params?: { page?: number; per_page?: number }) =>
    portalApi.get<{ data: PortalProject[]; meta?: PaginationMeta }>('/portal/projects', { params }),

  /** Get a specific project with milestones. */
  getProject: (id: number) =>
    portalApi.get<{ data: PortalProject; milestones: PortalMilestone[] }>(`/portal/projects/${id}`),

  /** List read-only tasks for a client's project. */
  getProjectTasks: (projectId: number) =>
    portalApi.get<{ data: PortalTask[] }>(`/portal/projects/${projectId}/tasks`),

  /** List all invoices belonging to the authenticated client. */
  getInvoices: (params?: { page?: number; per_page?: number }) =>
    portalApi.get<{ data: PortalInvoice[]; meta?: PaginationMeta }>('/portal/invoices', { params }),
};

// ============================================================
// Reports Types & Bindings (Sprint 8A)
// ============================================================

export interface ReportParams {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  export?: string; // csv
}

export interface PipelineReportParams extends ReportParams {
  lead_date_type?: 'created' | 'converted';
}

export interface RevenueReportSummary {
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_rate_pct: number;
  invoice_count: number;
  avg_invoice_value: number;
}

export interface RevenueReportTrend {
  month_key: string;
  invoiced_amount: number;
  collected_amount: number;
}

export interface RevenueReportTopClient {
  client_id: number;
  client_name: string;
  total_billed: number;
  total_paid: number;
  outstanding: number;
}

export interface RevenueReportData {
  period: { from: string; to: string };
  summary: RevenueReportSummary;
  trend: RevenueReportTrend[];
  top_clients: RevenueReportTopClient[];
}

export interface PipelineReportSummary {
  total_leads: number;
  converted_leads: number;
  conversion_rate_pct: number;
  avg_budget: number;
  total_pipeline_value: number;
  leads_created_period: number;
  leads_converted_period: number;
}

export interface PipelineByStage {
  stage_name: string;
  stage_color: string;
  lead_count: number;
  total_budget: string;
}

export interface PipelineBySource {
  source_name: string;
  source_color: string;
  lead_count: number;
  conversion_count: number;
  conversion_rate_pct: number;
}

export interface PipelineByExec {
  exec_name: string;
  lead_count: number;
  converted_count: number;
  total_pipeline_value: number;
  conversion_rate_pct: number;
}

export interface PipelineReportData {
  period: { from: string; to: string; date_type: string };
  summary: PipelineReportSummary;
  by_stage: PipelineByStage[];
  by_source: PipelineBySource[];
  by_exec: PipelineByExec[];
  temperature_split: {
    cold_count: number;
    warm_count: number;
    hot_count: number;
  };
}

export interface QuoteReportSummary {
  total_quotes: number;
  draft_count: number;
  pending_count: number;
  approved_count: number;
  sent_count: number;
  won_count: number;
  rejected_count: number;
  win_rate_pct: number;
  avg_quote_value: number;
  total_quote_value: number;
}

export interface QuoteReportFunnel {
  stage: string;
  count: number;
}

export interface QuoteReportTopService {
  service_name: string;
  quote_count: number;
  total_value: number;
}

export interface QuoteReportData {
  period: { from: string; to: string };
  summary: QuoteReportSummary;
  funnel: QuoteReportFunnel[];
  top_services: QuoteReportTopService[];
}

export interface ProfitabilityReportSummary {
  project_count: number;
  total_revenue: number;
  total_labor_cost: number;
  total_expense_cost: number;
  total_net_profit: number;
  avg_margin_pct: number;
}

export interface ProfitabilityReportRow {
  project_id: number;
  project_name: string;
  project_number: string;
  status: string;
  start_date: string;
  end_date: string;
  budget_amount: number;
  hours_logged: number;
  revenue: number;
  labor_cost: number;
  expense_cost: number;
  total_cost: number;
  net_profit: number;
  margin_percentage: number;
}

export interface ProfitabilityReportData {
  period: { from: string; to: string };
  summary: ProfitabilityReportSummary;
  breakdown: ProfitabilityReportRow[];
}

export interface UtilisationReportSummary {
  team_size: number;
  total_logged_hours: number;
  total_billable_hours: number;
  billable_rate_pct: number;
  avg_utilisation_pct: number;
}

export interface UtilisationReportRow {
  user_id: number;
  user_name: string;
  department: string;
  expected_hours: number;
  logged_hours: number;
  billable_hours: number;
  utilisation_pct: number;
  billable_rate_pct: number;
}

export interface UtilisationReportTopProject {
  project_name: string;
  total_hours: number;
  billable_hours: number;
}

export interface UtilisationReportData {
  period: { from: string; to: string };
  summary: UtilisationReportSummary;
  breakdown: UtilisationReportRow[];
  top_projects_by_hours: UtilisationReportTopProject[];
}

export interface ExpenseReportSummary {
  total_submitted: number;
  total_approved: number;
  total_pending: number;
  total_rejected: number;
  expense_count: number;
}

export interface ExpenseReportByCategory {
  category_name: string;
  category_color: string;
  count: number;
  total_amount: number;
}

export interface ExpenseReportByProject {
  project_name: string;
  count: number;
  total_amount: number;
}

export interface ExpenseReportByVendor {
  vendor_name: string;
  count: number;
  total_amount: number;
}

export interface ExpenseReportTrend {
  month_key: string;
  approved_amount: number;
  submitted_amount: number;
}

export interface ExpenseReportData {
  period: { from: string; to: string };
  summary: ExpenseReportSummary;
  by_category: ExpenseReportByCategory[];
  by_project: ExpenseReportByProject[];
  by_vendor: ExpenseReportByVendor[];
  trend: ExpenseReportTrend[];
}

export interface PayrollReportSummary {
  total_gross: number;
  total_net: number;
  total_deductions: number;
  total_bonuses: number;
  run_count: number;
}

export interface PayrollReportMonthRow {
  year: number;
  month: number;
  run_number: string;
  status: string;
  total_gross: number;
  total_net: number;
  employee_count: number;
}

export interface PayrollReportTopEarner {
  user_name: string;
  net_salary: number;
  base_salary: number;
  bonus_amount: number;
}

export interface PayrollReportData {
  period: { from: string; to: string };
  summary: PayrollReportSummary;
  by_month: PayrollReportMonthRow[];
  top_earners: PayrollReportTopEarner[];
}

export interface ClientReportSummary {
  total_clients: number;
  total_active: number;
  total_billed: number;
  total_collected: number;
  total_outstanding: number;
}

export interface ClientReportRow {
  client_id: number;
  client_name: string;
  client_email: string;
  phone?: string | null;
  status: 'active' | 'inactive' | 'suspended';
  is_client_portal_user: boolean;
  health_score: number;
  active_projects: number;
  total_projects: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  last_invoice_date: string | null;
  last_payment_date: string | null;
}

export interface ClientCommunication {
  id: number;
  client_id: number;
  recorded_by: number;
  recorder?: User;
  type: 'email' | 'call' | 'meeting' | 'other';
  subject: string;
  content?: string;
  communication_date: string;
  created_at: string;
  updated_at: string;
}

export interface ClientReportData {
  period: { from: string; to: string };
  summary: ClientReportSummary;
  breakdown: ClientReportRow[];
}

export interface DashboardBriefing {
  briefing: string;
  recommendations: string[];
  /**
   * 'ai' — a real model wrote the text; 'system' — the metrics-derived
   * fallback template (AI disabled, keyless, or the call failed). The UI must
   * label these differently and never present 'system' text as model output.
   */
  source: 'ai' | 'system';
  generated_at: string;
}

export const reports = {
  getDashboardSummary: () =>
    api.get<any>('/reports/dashboard'),

  // Separate endpoint so the dashboard's core data never waits on an external
  // AI call. Requires reports.view_financial (403 otherwise).
  getDashboardBriefing: () =>
    api.get<DashboardBriefing>('/reports/dashboard/briefing'),

  getRevenue: (params?: ReportParams) =>
    api.get<RevenueReportData>('/reports/revenue', { params }),
  
  getPipeline: (params?: PipelineReportParams) =>
    api.get<PipelineReportData>('/reports/pipeline', { params }),
  
  getQuotes: (params?: ReportParams) =>
    api.get<QuoteReportData>('/reports/quotes', { params }),
  
  getProfitability: (params?: ReportParams) =>
    api.get<ProfitabilityReportData>('/reports/profitability', { params }),
  
  getUtilisation: (params?: ReportParams) =>
    api.get<UtilisationReportData>('/reports/utilisation', { params }),
  
  getExpenses: (params?: ReportParams) =>
    api.get<ExpenseReportData>('/reports/expenses', { params }),
  
  getPayroll: (params?: ReportParams) =>
    api.get<PayrollReportData>('/reports/payroll', { params }),
  
  getClients: (params?: ReportParams) =>
    api.get<ClientReportData>('/reports/clients', { params }),

  // CSV export must go through the authenticated axios instance (Bearer token
  // header, attached by the request interceptor) and come back as a blob to
  // save via an object URL — the backend only ever authenticates via that
  // header, so a plain `window.open(...&token=...)` never actually
  // authenticates and 401s instead of downloading.
  exportCsv: (
    endpoint: 'revenue' | 'pipeline' | 'quotes' | 'profitability' | 'utilisation' | 'expenses' | 'payroll' | 'clients',
    params?: Record<string, any>
  ) => api.get<Blob>(`/reports/${endpoint}`, { params: { ...params, export: 'csv' }, responseType: 'blob', timeout: 90000 }),
};

// ============================================================
// Settings & Audit Logs & Backups Types (Sprint 8B)
// ============================================================

export interface CompanySettings {
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  timezone: string;
  date_format?: string;
  logo_url?: string | null;
}

export interface TaxSettings {
  default_tax_rate: number;
}

export interface NumberSequence {
  id: number;
  entity_type: 'lead' | 'quote' | 'invoice' | 'project' | 'task' | 'payroll' | string;
  prefix: string;
  current_number: number;
  padding_length: number;
  format: string;
}

export interface CurrencySetting {
  id: number;
  code: string;
  name: string;
  symbol: string;
  exchange_rate_to_inr: number;
  is_default: boolean;
  is_active: boolean;
}

export interface SystemSettings {
  company: CompanySettings;
  tax: TaxSettings;
  currencies: CurrencySetting[];
  number_sequences: NumberSequence[];
}

export interface AuditLog {
  id: number;
  user_id: number;
  user?: User;
  auditable_type: string;
  auditable_id: number;
  event: 'created' | 'updated' | 'deleted' | 'restored' | string;
  ip_address?: string;
  user_agent?: string;
  metadata?: {
    old?: Record<string, any>;
    new?: Record<string, any>;
    type?: string;
    filename?: string;
    restored_file?: string;
    fallback_backup?: string;
    [key: string]: any;
  } | null;
  created_at: string;
}

export interface AuditLogParams {
  page?: number;
  per_page?: number;
  user_id?: number;
  auditable_type?: string;
  event?: string;
  from?: string;
  to?: string;
}

export interface BackupFile {
  filename: string;
  size: number;
  created_at: string;
  status: 'valid' | 'corrupted';
}

export const platformSettings = {
  get: () => api.get<SystemSettings>('/settings'),
  updateCompany: (data: CompanySettings) => api.put<void>('/settings/company', data),
  updateSmtp: (data: any) => api.put<void>('/settings/smtp', data),
  sendTestEmail: (to?: string) =>
    api.post<{ message: string }>('/settings/smtp/test', to ? { to } : {}),
  updateTax: (data: TaxSettings) => api.put<void>('/settings/tax', data),
  updateNumberSequences: (sequences: NumberSequence[]) => api.put<void>('/settings/number-sequences', { sequences }),
  updateCurrencies: (data: { default_currency_code: string; active_currency_codes: string[] }) =>
    api.put<void>('/settings/currencies', data),
};

export const auditLogs = {
  list: (params?: AuditLogParams) =>
    api.get<{ data: AuditLog[]; meta: PaginationMeta }>('/audit-logs', { params }),
  exportCsv: (params?: AuditLogParams) =>
    api.get('/audit-logs', { params: { ...params, export: 'csv' }, responseType: 'blob', timeout: 90000 }),
};

export const backups = {
  list: () => api.get<BackupFile[]>('/backups'),
  create: () => api.post<BackupFile>('/backups', {}, { timeout: 120000 }),
  restore: (filename: string) => api.post<void>(`/backups/${filename}/restore`, {}, { timeout: 120000 }),
  delete: (filename: string) => api.delete<void>(`/backups/${filename}`),
};

export interface DeletedRecord {
  id: number;
  deletable_type: string;
  deletable_type_label: string;
  deletable_id: number;
  record_snapshot: Record<string, any>;
  deletion_reason?: string | null;
  deleted_at: string;
  deleted_by: { id: number; name: string; email: string; avatar_url?: string | null } | null;
}

export interface RecoveryBinParams {
  page?: number;
  per_page?: number;
  type?: string;
  deleted_by?: number;
  from?: string;
  to?: string;
  search?: string;
}

export const recoveryApi = {
  list: (params?: RecoveryBinParams) =>
    api.get<{ data: DeletedRecord[]; meta: PaginationMeta }>('/recovery-bin', { params }),
  restore: (id: number, reason?: string) =>
    api.post<{ message: string }>(`/recovery-bin/${id}/restore`, { reason }),
};

export const systemReset = {
  resetPlatform: (data: { password?: string; confirmation?: string }) =>
    api.post('/system/reset', data, { timeout: 120000 }),
  resetModule: (data: { module: string; password?: string }) =>
    api.post('/system/reset/module', data, { timeout: 120000 }),
  factoryReset: (data: { password?: string; confirmation?: string }) =>
    api.post('/system/factory-reset', data, { timeout: 120000 }),
};

export type AttendanceStatus = 'present' | 'partial' | 'absent' | 'leave' | 'holiday';

export interface AttendanceRecord {
  id: number;
  user_id: number;
  user?: User;
  date: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  break_minutes: number;
  status: AttendanceStatus;
  notes?: string | null;
  location?: string | null;
  worked_minutes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceSummary {
  present_days: number;
  absent_days: number;
  leave_days: number;
  total_worked_minutes: number;
  avg_daily_minutes: number;
  avg_daily_hours: number;
}

export interface TeamAttendanceEntry {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
  roles: string[];
  attendance: {
    id: number;
    status: AttendanceStatus;
    check_in_at?: string | null;
    check_out_at?: string | null;
    worked_minutes: number;
  } | null;
}

export interface LaravelPaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface LeaveType {
  id: number;
  name: string;
  code: string;
  days_allowed: number;
  is_paid: boolean;
  color?: string | null;
  active: boolean;
}

export interface LeaveRequest {
  id: number;
  user_id: number;
  user?: User;
  leave_type_id: number;
  leave_type?: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: number | null;
  approver?: User;
  approved_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  type: 'national' | 'regional' | 'optional';
  description?: string | null;
}

export const attendanceApi = {
  today: () => api.get<AttendanceRecord | null>('/attendance/today'),
  team: () => api.get<TeamAttendanceEntry[]>('/attendance/team'),
  summary: (params?: Record<string, any>) => api.get<AttendanceSummary>('/attendance/summary', { params }),
  list: (params?: Record<string, any>) => api.get<LaravelPaginatedResponse<AttendanceRecord>>('/attendance', { params }),
  clockIn: (data?: { notes?: string; location?: string }) => api.post<{ message: string; data: AttendanceRecord }>('/attendance/clock-in', data || {}),
  clockOut: (data?: { break_minutes?: number }) => api.post<{ message: string; data: AttendanceRecord }>('/attendance/clock-out', data || {}),
  /** HR: create or backfill a record for any user/date (upserts on user_id+date). */
  create: (data: { user_id: number; date: string; status: AttendanceStatus; check_in_at?: string; check_out_at?: string; break_minutes?: number; notes?: string; location?: string }) =>
    api.post<{ message: string; data: AttendanceRecord }>('/attendance', data),
  update: (id: number, data: Partial<Pick<AttendanceRecord, 'check_in_at' | 'check_out_at' | 'break_minutes' | 'status' | 'notes'>>) =>
    api.put<{ data: AttendanceRecord }>(`/attendance/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/attendance/${id}`),
};

export const leaveApi = {
  types: () => api.get<LeaveType[]>('/leave/types'),
  list: (params?: Record<string, any>) => api.get<LaravelPaginatedResponse<LeaveRequest>>('/leave/requests', { params }),
  create: (data: { leave_type_id: number; start_date: string; end_date: string; reason?: string }) =>
    api.post<{ data: LeaveRequest }>('/leave/requests', data),
  approve: (id: number) => api.post<{ data: LeaveRequest }>(`/leave/requests/${id}/approve`),
  reject: (id: number, data: { rejection_reason?: string }) => api.post<{ data: LeaveRequest }>(`/leave/requests/${id}/reject`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/leave/requests/${id}`),
};

export const holidaysApi = {
  list: (params?: Record<string, any>) => api.get<Holiday[]>('/holidays', { params }),
  create: (data: { name: string; date: string; type?: string; description?: string }) => api.post<{ data: Holiday }>('/holidays', data),
  update: (id: number, data: Partial<Pick<Holiday, 'name' | 'date' | 'type' | 'description'>>) => api.put<{ data: Holiday }>(`/holidays/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/holidays/${id}`),
};

export interface NotificationPreferenceItem {
  id?: number;
  event_type: string;
  in_app: boolean;
  email: boolean;
  push: boolean;
}

export const notificationPreferences = {
  get: () => api.get<NotificationPreferenceItem[]>('/settings/notifications'),
  update: (preferences: Array<{ event_type: string; email: boolean; in_app?: boolean }>) =>
    api.put<{ message: string; data: NotificationPreferenceItem[] }>('/settings/notifications', { preferences }),
};

export interface FileUploadResponse {
  filename: string;
  file_path: string;
  url: string;
  mime_type: string;
  file_size: number;
}

export const filesApi = {
  upload: (file: File, type?: 'avatar' | 'logo' | 'receipt' | 'attachment') => {
    const formData = new FormData();
    formData.append('file', file);
    if (type) {
      formData.append('type', type);
    }
    return api.post<FileUploadResponse>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export interface ClientContact {
  id: number;
  client_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
  is_primary: boolean;
}

export interface ClientDirectoryRow extends ClientReportRow {
  company_name?: string | null;
}

export interface ClientDirectoryData {
  summary: {
    total_clients: number;
    total_active: number;
    total_billed: number;
    total_collected: number;
    total_outstanding: number;
  };
  breakdown: ClientDirectoryRow[];
}

export interface ClientProjectRow {
  id: number;
  project_number: string;
  name: string;
  status: string;
  completion_percentage: number;
  start_date?: string | null;
  end_date?: string | null;
  budget_amount?: number | null;
}

export interface ClientInvoiceRow {
  id: number;
  invoice_number: string;
  title?: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  exchange_rate: number;
  issue_date?: string | null;
  due_date?: string | null;
}

export interface ClientQuoteRow {
  id: number;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  valid_until?: string | null;
}

export interface ClientDetail {
  client: {
    id: number;
    name: string;
    company_name?: string | null;
    email: string;
    phone?: string | null;
    status: 'active' | 'inactive' | 'suspended';
    is_client_portal_user: boolean;
    billing_address?: string | null;
    tax_number?: string | null;
    default_currency?: { id: number; code: string; symbol?: string; name?: string } | null;
    last_login_at?: string | null;
    created_at?: string | null;
  };
  contacts: ClientContact[];
  projects: {
    active: ClientProjectRow[];
    pipeline: ClientProjectRow[];
    closed: ClientProjectRow[];
    total_count: number;
  };
  invoices: { items: ClientInvoiceRow[]; total_count: number };
  quotes: { items: ClientQuoteRow[]; total_count: number };
  totals: { total_billed: number; total_paid: number; total_outstanding: number };
  revenue_history: Array<{ month_key: string; month_name: string; billed: number; collected: number }>;
  health: {
    score: number;
    components: {
      overdue_invoices: number;
      overdue_penalty: number;
      on_hold_projects: number;
      on_hold_penalty: number;
      cancelled_projects: number;
      cancelled_penalty: number;
      outstanding_penalty: number;
    };
  };
}

export interface ClientUpdatePayload {
  name?: string;
  company_name?: string | null;
  email?: string;
  phone?: string | null;
  status?: 'active' | 'inactive' | 'suspended';
  is_client_portal_user?: boolean;
  billing_address?: string | null;
  tax_number?: string | null;
  default_currency_id?: number | null;
}

// The Clients module's own endpoints, gated on clients.* permissions —
// unlike reports/clients (reports.*) and /users (users.*), these work for
// the sales roles the module is built for.
export const clientsApi = {
  // GET /clients returns {summary, breakdown} with no `data` key, so the
  // global interceptor passes it through untouched.
  list: () => api.get<ClientDirectoryData>('/clients'),

  show: (clientId: number) => api.get<ClientDetail>(`/clients/${clientId}`),

  create: (data: {
    name: string; company_name?: string; email: string; password: string;
    phone?: string; billing_address?: string; tax_number?: string; default_currency_id?: number;
  }) => api.post<{ message: string; data: { id: number } }>('/clients', data),

  update: (clientId: number, data: ClientUpdatePayload) =>
    api.put(`/clients/${clientId}`, data),

  delete: (clientId: number) => api.delete(`/clients/${clientId}`),

  createContact: (clientId: number, data: { name: string; email?: string; phone?: string; designation?: string; is_primary?: boolean }) =>
    api.post<{ message: string; data: ClientContact }>(`/clients/${clientId}/contacts`, data),

  updateContact: (clientId: number, contactId: number, data: Partial<{ name: string; email: string; phone: string; designation: string; is_primary: boolean }>) =>
    api.put(`/clients/${clientId}/contacts/${contactId}`, data),

  deleteContact: (clientId: number, contactId: number) =>
    api.delete(`/clients/${clientId}/contacts/${contactId}`),

  listCommunications: (clientId: number) =>
    api.get<ClientCommunication[]>(`/clients/${clientId}/communications`),

  createCommunication: (clientId: number, data: { type: string; subject: string; content?: string; communication_date: string }) =>
    api.post<ClientCommunication>(`/clients/${clientId}/communications`, data),

  deleteCommunication: (clientId: number, id: number) =>
    api.delete(`/clients/${clientId}/communications/${id}`),
};

// ============================================================
// Task Templates (PRD: service templates + recurring projects)
// ============================================================

export interface TaskTemplateItem {
  id: number;
  template_id: number;
  title: string;
  description?: string | null;
  estimated_hours?: number | string | null;
  sort_order: number;
}

export interface TaskTemplate {
  id: number;
  name: string;
  description?: string | null;
  estimated_hours?: number | string | null;
  items: TaskTemplateItem[];
  items_count?: number;
  created_at?: string;
}

export interface TaskTemplateItemPayload {
  title: string;
  description?: string;
  estimated_hours?: number;
}

export const taskTemplatesApi = {
  list: () => api.get<TaskTemplate[]>('/task-templates'),
  create: (data: { name: string; description?: string; items: TaskTemplateItemPayload[] }) =>
    api.post<{ message: string; data: TaskTemplate }>('/task-templates', data),
  update: (id: number, data: { name?: string; description?: string; items?: TaskTemplateItemPayload[] }) =>
    api.put(`/task-templates/${id}`, data),
  delete: (id: number) => api.delete(`/task-templates/${id}`),
  applyToProject: (projectId: number, templateId: number, setAsRecurring = false) =>
    api.post<{ message: string; data: { created_count: number } }>(`/projects/${projectId}/apply-template`, {
      template_id: templateId,
      set_as_recurring_template: setAsRecurring,
    }),
};

// ============================================================
// AI Assistant Endpoints
// ============================================================

export interface AiConversation {
  id: number;
  title: string;
  is_pinned: boolean;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
  messages?: AiMessage[];
}

export interface AiMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  reactions?: string[];
  created_at: string;
  attachments?: AiAttachment[];
}

export interface AiAttachment {
  id: number;
  filename: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  url: string;
}

export interface AiAutomation {
  id: number;
  name: string;
  trigger_event: string;
  conditions: any[];
  actions: any[];
  is_active: boolean;
  /** Honest activity trail — when this rule last actually fired, and how often. */
  last_triggered_at?: string | null;
  trigger_count?: number;
  created_at: string;
}

export interface AiStatus {
  /** Feature flag (config) — when false, AI features are switched off entirely. */
  enabled: boolean;
  /** True only when a real model can be called; false = simulation mode. */
  configured: boolean;
  model: string;
}

export interface AiActionConfirmation {
  action: string;
  params: any;
  message: string;
}

export interface AiChatResponse {
  conversation_id: number;
  action_confirmation?: AiActionConfirmation;
  message: AiMessage;
}

export const aiApi = {
  // Paginated (pinned first, then most recent). The paginator envelope
  // carries current_page, so the interceptor keeps it intact.
  listConversations: (search?: string, page = 1, perPage = 50) =>
    api.get<LaravelPaginatedResponse<AiConversation>>('/ai/conversations', { params: { search, page, per_page: perPage } }),

  status: () => api.get<AiStatus>('/ai/status'),

  createConversation: (title: string) =>
    api.post<AiConversation>('/ai/conversations', { title }),

  getConversation: (id: number) =>
    api.get<AiConversation>(`/ai/conversations/${id}`),

  deleteConversation: (id: number) =>
    api.delete(`/ai/conversations/${id}`),

  togglePin: (id: number) =>
    api.put<AiConversation>(`/ai/conversations/${id}/pin`),

  toggleSave: (id: number) =>
    api.put<AiConversation>(`/ai/conversations/${id}/save`),

  reactToMessage: (id: number, reaction: string) =>
    api.post<AiMessage>(`/ai/messages/${id}/react`, { reaction }),

  chat: (data: {
    content?: string;
    conversation_id?: number;
    attachments?: Array<{ filename: string; file_path: string; mime_type: string; file_size: number }>;
    confirmed_action?: string;
    confirmed_params?: any;
  }) => api.post<AiChatResponse>('/ai/chat', data, { timeout: 120000 }),

  voiceTalk: (content: string, conversationId?: number) =>
    api.post<{ conversation_id: number; response_text: string }>('/ai/voice/talk', {
      content,
      conversation_id: conversationId,
    }, { timeout: 120000 }),

  listAutomations: () =>
    api.get<AiAutomation[]>('/ai/automations'),

  createAutomation: (data: { name: string; trigger_event: string; conditions?: any[]; actions: any[]; is_active?: boolean }) =>
    api.post<AiAutomation>('/ai/automations', data),

  updateAutomation: (id: number, data: Partial<AiAutomation>) =>
    api.put<AiAutomation>(`/ai/automations/${id}`, data),

  deleteAutomation: (id: number) =>
    api.delete(`/ai/automations/${id}`),
};




