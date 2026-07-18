'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Eye, EyeOff, MailPlus, CheckCircle } from 'lucide-react';
import { users as usersApi, getApiErrorMessage } from '@/lib/api';
import type { User, Role, Department } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { useAuthStore } from '@/store/auth';

interface UserFormModalProps {
  user: User | null;
  roles: Role[];
  departments: Department[];
  /** Staff directory for the "Reports To" picker (client accounts excluded by the caller). */
  allUsers: User[];
  onClose: () => void;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  email: string;
  password: string;
  phone: string;
  employee_id: string;
  status: 'active' | 'inactive';
  role_ids: number[];
  department_ids: number[];
  manager_ids: number[];
  hourly_rate: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  phone: '',
  employee_id: '',
  status: 'active',
  role_ids: [],
  department_ids: [],
  manager_ids: [],
  hourly_rate: '',
};

export default function UserFormModal({ user, roles, departments, allUsers, onClose, onSuccess }: UserFormModalProps) {
  const { user: currentUser } = useAuthStore();
  const isFounder = currentUser?.roles?.some((r: any) => (typeof r === 'string' ? r : r?.name) === 'founder');

  const isEdit = user !== null;
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<FormState & { server: string }>>({});
  // Set when the backend reports the email belongs to an existing active user,
  // enabling the "Resend Welcome Email" action instead of a dead end.
  const [existingUserId, setExistingUserId] = useState<number | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);

  // The list payload doesn't carry reporting lines — fetch the full record
  // so the "Reports To" picker prefills with the user's current managers.
  const { data: fullUser } = useQuery({
    queryKey: ['user', user?.id, 'form-prefill'],
    queryFn: async () => {
      const res = await usersApi.show(user!.id);
      return res.data as unknown as User;
    },
    enabled: !!user,
  });

  // Pre-fill for edit
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        phone: user.phone || '',
        employee_id: user.employee_id || '',
        status: user.status,
        role_ids: user.roles.map((r) => r.id),
        department_ids: user.departments.map((d) => d.id),
        manager_ids: (fullUser?.managers || []).map((m) => m.id),
        hourly_rate: user.hourly_rate ? String(user.hourly_rate) : '',
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [user, fullUser]);

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      usersApi.create({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone || undefined,
        employee_id: data.employee_id || undefined,
        status: data.status,
        role_ids: data.role_ids,
        department_ids: data.department_ids,
        manager_ids: data.manager_ids,
        hourly_rate: data.hourly_rate ? Number(data.hourly_rate) : undefined,
      }),
    onSuccess,
    onError: (err: unknown) => {
      const resp = (err as { response?: { data?: { existing_user_id?: number } } })?.response?.data;
      setExistingUserId(resp?.existing_user_id ?? null);
      setResendSuccess(null);
      setErrors((p) => ({
        ...p,
        server: getApiErrorMessage(err, 'Failed to create user. Please check your inputs and try again.'),
      }));
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: number) => usersApi.resendInvite(id),
    onSuccess: (res) => {
      setErrors((p) => ({ ...p, server: undefined }));
      setResendSuccess(
        (res.data as { message?: string })?.message ||
          'Welcome email resent with a new temporary password.'
      );
    },
    onError: (err: unknown) => {
      setResendSuccess(null);
      setErrors((p) => ({
        ...p,
        server: getApiErrorMessage(err, 'Failed to resend the welcome email.'),
      }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormState) =>
      usersApi.update(user!.id, {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        employee_id: data.employee_id || undefined,
        status: data.status,
        role_ids: data.role_ids,
        department_ids: data.department_ids,
        manager_ids: data.manager_ids,
        hourly_rate: data.hourly_rate ? Number(data.hourly_rate) : undefined,
      }),
    onSuccess,
    onError: (err: unknown) => {
      setErrors((p) => ({
        ...p,
        server: getApiErrorMessage(err, 'Failed to update user. Please check your inputs and try again.'),
      }));
    },
  });

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    if (!isEdit && !form.password) errs.password = 'Password is required';
    if (!isEdit && form.password && form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setExistingUserId(null);
    setResendSuccess(null);
    if (isEdit) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleRole = (id: number) => {
    setForm((p) => ({
      ...p,
      role_ids: p.role_ids.includes(id)
        ? p.role_ids.filter((r) => r !== id)
        : [...p.role_ids, id],
    }));
  };

  const toggleDept = (id: number) => {
    setForm((p) => ({
      ...p,
      department_ids: p.department_ids.includes(id)
        ? p.department_ids.filter((d) => d !== id)
        : [...p.department_ids, id],
    }));
  };

  const toggleManager = (id: number) => {
    setForm((p) => ({
      ...p,
      manager_ids: p.manager_ids.includes(id)
        ? p.manager_ids.filter((m) => m !== id)
        : [...p.manager_ids, id],
    }));
  };

  // Staff who can be picked as a manager: active, not a client portal
  // account, and not the person being edited (no self-reporting).
  const managerOptions = allUsers.filter(
    (u) => u.status === 'active' && !(u as any).is_client_portal_user && u.id !== user?.id
  );

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Edit User' : 'Invite New User'}</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            style={{ padding: '0.25rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form id="user-form" onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Server error */}
            {errors.server && (
              <div style={{
                padding: '0.75rem 1rem',
                background: 'var(--danger-subtle)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.625rem',
              }}>
                <span>{errors.server}</span>
                {existingUserId !== null && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ alignSelf: 'flex-start', gap: '0.4rem' }}
                    disabled={resendInviteMutation.isPending}
                    onClick={() => resendInviteMutation.mutate(existingUserId)}
                  >
                    <MailPlus size={15} />
                    {resendInviteMutation.isPending ? 'Resending…' : 'Resend Welcome Email'}
                  </button>
                )}
              </div>
            )}

            {/* Resend success */}
            {resendSuccess && (
              <div style={{
                padding: '0.75rem 1rem',
                background: 'var(--success-subtle, rgba(34,197,94,0.1))',
                border: '1px solid var(--success, #22c55e)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--success, #22c55e)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}>
                <CheckCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                {resendSuccess}
              </div>
            )}

            {/* Row 1: Name + Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="user-name">Full Name *</label>
                <input
                  id="user-name"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={form.name}
                  onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setErrors((p) => ({ ...p, name: undefined })); }}
                  className={`form-input${errors.name ? ' error' : ''}`}
                />
                {errors.name && <span className="form-error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="user-email">Email Address *</label>
                <input
                  id="user-email"
                  type="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); setErrors((p) => ({ ...p, email: undefined })); }}
                  className={`form-input${errors.email ? ' error' : ''}`}
                />
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>
            </div>

            {/* Password (create only) */}
            {!isEdit && (
              <div className="form-group">
                <label className="form-label" htmlFor="user-password" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Password *
                  <HelpIcon text="A temporary password for the new user's first sign-in (min. 8 characters). Share it with them securely — they can change it later." />
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="user-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={(e) => { setForm((p) => ({ ...p, password: e.target.value })); setErrors((p) => ({ ...p, password: undefined })); }}
                    className={`form-input${errors.password ? ' error' : ''}`}
                    style={{ paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <span className="form-error">{errors.password}</span>}
              </div>
            )}

            {/* Row 2: Phone + Employee ID */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="user-phone">Phone</label>
                <input
                  id="user-phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="user-emp-id" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Employee ID
                  <HelpIcon text="The company's internal staff code (e.g. CRE007). Used to match this account to HR and payroll records." />
                </label>
                <input
                  id="user-emp-id"
                  type="text"
                  placeholder="e.g. CRE007"
                  value={form.employee_id}
                  onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))}
                  className="form-input"
                />
              </div>
            </div>

            {/* Status & Per Hour Price */}
            <div style={{ display: 'grid', gridTemplateColumns: isFounder ? '1fr 1fr' : '1fr', gap: '0.875rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="user-status" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Status
                  <HelpIcon text="Active users can sign in. Set to Inactive to block sign-in without deleting the person's history — use this when someone leaves." />
                </label>
                <select
                  id="user-status"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}
                  className="form-input"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {isFounder && (
                <div className="form-group">
                  <label className="form-label" htmlFor="user-hourly-rate" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Per Hour Price (INR)
                    <HelpIcon text="Set the billing rate per hour for this individual. If set, this rate will override general defaults." />
                  </label>
                  <input
                    id="user-hourly-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 500"
                    value={form.hourly_rate}
                    onChange={(e) => setForm((p) => ({ ...p, hourly_rate: e.target.value }))}
                    className="form-input"
                  />
                </div>
              )}
            </div>

            {/* Roles (checkbox list) */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Roles
                <HelpIcon text="Roles control what this person can see and do in the app (e.g. Admin manages everything, Designer sees design work). Tick every role that applies — give only what they need." />
              </label>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.375rem',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
              }}>
                {roles.map((role) => (
                  <label
                    key={role.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.375rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      id={`role-${role.id}`}
                      checked={form.role_ids.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{role.display_name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Departments (checkbox list) */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Departments
                <HelpIcon text="Which team(s) this person belongs to — used for org structure and team reports. Unlike roles, departments don't change what they can access." />
              </label>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.375rem',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
              }}>
                {departments.map((dept) => (
                  <label
                    key={dept.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.375rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      id={`dept-${dept.id}`}
                      checked={form.department_ids.includes(dept.id)}
                      onChange={() => toggleDept(dept.id)}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{dept.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Reports To (many-to-many reporting lines, PRD) */}
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Reports To
                <HelpIcon text="The manager(s) this person reports to — more than one is fine (e.g. a designer reporting to both a Team Lead and a Project Manager). The first one ticked is treated as the primary reporting line." />
              </label>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.375rem',
              }}>
                {managerOptions.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.375rem' }}>
                    No other active staff to report to yet.
                  </span>
                ) : managerOptions.map((m) => (
                  <label
                    key={m.id}
                    htmlFor={`manager-${m.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '0.375rem 0.5rem',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      id={`manager-${m.id}`}
                      checked={form.manager_ids.includes(m.id)}
                      onChange={() => toggleManager(m.id)}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{m.name}</span>
                    {form.manager_ids[0] === m.id && (
                      <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--accent)' }}>PRIMARY</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              id="user-form-submit"
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading
                ? (isEdit ? 'Saving…' : 'Inviting…')
                : (isEdit ? 'Save Changes' : 'Send Invite')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
