'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight, Filter, AlertTriangle, ExternalLink } from 'lucide-react';
import { users as usersApi, roles as rolesApi, departments as deptApi, getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import type { User, Role, Department } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import UserFormModal from './components/UserFormModal';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useAuthStore } from '@/store/auth';

const USERS_HOWTO = {
  overview: 'Every person who signs in to Creativals OS — employees, managers, and clients — has a user account listed here. Each account has roles (what they are allowed to do) and departments (which team they belong to).',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Invite User" to add a new team member — fill in their name, email, and a temporary password.',
        'Tick one or more Roles to control what the person can see and do in the app.',
        'Tick a Department so the person shows up in the right team for reporting.',
        'Use the search box or the status / department / role filters to find someone quickly.',
      ],
    },
    {
      heading: 'Day to day',
      items: [
        'Click the open icon on a row to view a user\'s full profile and compensation details.',
        'Click the pencil icon to edit a user — change their roles, department, or status.',
        'Set a user to "Inactive" when they leave — this keeps their history but blocks their access.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Give each person only the roles they actually need — fewer roles means fewer mistakes.',
        'Fill in the Employee ID so payroll and HR records match up.',
        'Prefer deactivating a user over deleting them — deleting removes them permanently.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Deleting a user who has left instead of setting them Inactive — you lose their history.',
        'Forgetting to assign a role — a user with no role may not be able to do anything.',
        'Assigning someone to no department, which makes team reports incomplete.',
      ],
    },
  ],
};

// ── Role Colors ────────────────────────────────────────────────
const ROLE_COLOR_MAP: Record<string, { bg: string; color: string }> = {
  founder:          { bg: 'rgba(124,58,237,0.15)', color: '#a78bfa' },
  admin:            { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  director:         { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  sales_head:       { bg: 'rgba(234,179,8,0.15)',  color: '#facc15' },
  sales_exec:       { bg: 'rgba(249,115,22,0.15)', color: '#fb923c' },
  project_manager:  { bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  designer:         { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  developer:        { bg: 'rgba(239,68,68,0.15)',  color: '#f87171' },
  hr:               { bg: 'rgba(236,72,153,0.15)', color: '#f472b6' },
  accounts:         { bg: 'rgba(20,184,166,0.15)', color: '#2dd4bf' },
  finance:          { bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
  employee:         { bg: 'rgba(107,114,128,0.15)',color: '#9ca3af' },
};

function RoleBadge({ role }: { role: Role }) {
  const colors = ROLE_COLOR_MAP[role.name] || { bg: 'var(--surface-elevated)', color: 'var(--text-secondary)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '0.6875rem',
      fontWeight: 600,
      background: colors.bg,
      color: colors.color,
      whiteSpace: 'nowrap',
    }}>
      {role.display_name}
    </span>
  );
}

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return (
    <span className={`badge ${status === 'active' ? 'badge-success' : 'badge-muted'}`}>
      {status.toUpperCase()}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function UsersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const canCreate = user?.permissions?.includes('users.create') ?? false;
  const canEdit = user?.permissions?.includes('users.edit') ?? false;
  const canDelete = user?.permissions?.includes('users.delete') ?? false;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // ── Fetch users from real API ──────────────────────────────
  const {
    data: usersData,
    isLoading,
    isError,
    error: usersError,
  } = useQuery({
    queryKey: ['users', { search, statusFilter, deptFilter, roleFilter, page }],
    queryFn: async () => {
      const res = await usersApi.list({
        search: search || undefined,
        status: statusFilter || undefined,
        department_id: deptFilter ? Number(deptFilter) : undefined,
        role_id: roleFilter ? Number(roleFilter) : undefined,
        page,
        per_page: 25,
      });
      return res.data;
    },
  });

  // ── Fetch roles for filter & form ──────────────────────────
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await rolesApi.list();
      const payload = res.data as any;
      return (Array.isArray(payload) ? payload : (payload?.data ?? [])) as Role[];
    },
  });

  // ── Fetch departments for filter & form ────────────────────
  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await deptApi.list();
      const payload = res.data as any;
      return (Array.isArray(payload) ? payload : (payload?.data ?? [])) as Department[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteConfirm(null);
      showToast('User deleted successfully.', 'success');
    },
    onError: (error: any) => {
      const message = getApiErrorMessage(error, 'Failed to delete user. You may not have permission.');
      showToast(message, 'error');
      setDeleteConfirm(null);
    },
  });

  const displayUsers: User[] = usersData?.data || [];
  const meta = usersData?.meta || { current_page: 1, last_page: 1, total: 0 };

  const handleEdit = (user: User) => {
    setEditUser(user);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditUser(null);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            User Management
            <HelpIcon title="User Management" content={{
              what: 'Every person who signs in to Creativals OS has a user account here — with roles that control what they can do, and departments that say which team they are on.',
              why: 'Keeping roles, departments, and statuses correct is what keeps the right people seeing the right things across the whole app.',
              when: 'Come here to invite a new team member, change someone\'s role or department, or deactivate someone who has left.',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Manage team members, roles, and access.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="users" title="How User Management Works" content={USERS_HOWTO} />
          {canCreate && (
            <button
              id="invite-user-btn"
              onClick={() => { setEditUser(null); setModalOpen(true); }}
              className="btn btn-primary"
            >
              <Plus size={16} /> Invite User
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        marginBottom: '1rem', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{
            position: 'absolute', left: '0.75rem', top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            id="user-search"
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        <Filter size={15} style={{ color: 'var(--text-muted)' }} />

        {/* Status */}
        <select
          id="filter-status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="form-input"
          style={{ width: 140 }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <HelpIcon text="Active users can sign in; Inactive users are blocked from signing in but keep their history." />

        {/* Department */}
        <select
          id="filter-dept"
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
          className="form-input"
          style={{ width: 160 }}
        >
          <option value="">All departments</option>
          {(deptsData || []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {/* Role */}
        <select
          id="filter-role"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="form-input"
          style={{ width: 160 }}
        >
          <option value="">All roles</option>
          {(rolesData || []).map((r) => (
            <option key={r.id} value={r.id}>{r.display_name}</option>
          ))}
        </select>
        <HelpIcon text="A role controls what the user is allowed to do (e.g. Admin, Designer). A department is just which team they belong to." />
      </div>
      
      {/* API Error Banner */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.875rem 1rem',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem',
          color: 'var(--danger)',
          fontSize: '0.875rem',
        }}>
          <AlertTriangle size={16} />
          <span>
            Failed to load users: {getApiErrorMessage(usersError, 'Unknown error')}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="data-table-wrap">
        {isLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : isError ? (
          <EmptyState
            title="Could not load users"
            description="There was an error fetching users from the server. Please check your connection or permissions."
          />
        ) : displayUsers.length === 0 ? (
          <EmptyState
            title="No users found"
            description="Adjust your filters or invite a new user to get started."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Employee ID <HelpIcon text="The company's internal staff code (e.g. CRE007), used to match this account to HR and payroll records." /></th>
                <th>Roles <HelpIcon text="What this person is allowed to see and do in the app. A user can have more than one role." /></th>
                <th>Department</th>
                <th>Status <HelpIcon text="Active users can sign in. Inactive users are blocked but their records are kept." /></th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayUsers.map((user) => (
                <tr key={user.id}>
                  {/* Avatar + Name */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="avatar avatar-md">
                        {user.avatar_url
                          ? <img src={user.avatar_url} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          : getInitials(user.name)
                        }
                      </div>
                      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{user.email}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                    {user.employee_id || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {user.roles.length > 0 
                        ? user.roles.map((r) => <RoleBadge key={r.id} role={r} />)
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                      }
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {user.departments && user.departments.length > 0 ? user.departments[0].name : '—'}
                  </td>
                  <td><StatusBadge status={user.status} /></td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.375rem' }}>
                      <Link
                        id={`view-user-${user.id}`}
                        href={`/users/${user.id}`}
                        className="btn btn-ghost btn-sm btn-icon"
                        title="View profile"
                      >
                        <ExternalLink size={14} />
                      </Link>
                      {canEdit && (
                        <button
                          id={`edit-user-${user.id}`}
                          onClick={() => handleEdit(user)}
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Edit user"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          id={`delete-user-${user.id}`}
                          onClick={() => setDeleteConfirm(user.id)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Delete user"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && !isError && meta.last_page > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '0 0.25rem',
        }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Showing {displayUsers.length} of {meta.total} users
          </span>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.current_page === 1}
              className="btn btn-secondary btn-sm"
            >
              <ChevronLeft size={14} />
            </button>
            {[...Array(meta.last_page)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className="btn btn-sm"
                style={{
                  background: meta.current_page === i + 1 ? 'var(--accent)' : 'var(--surface-elevated)',
                  color: meta.current_page === i + 1 ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
              disabled={meta.current_page === meta.last_page}
              className="btn btn-secondary btn-sm"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm !== null && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <span className="modal-title">Delete User?</span>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
                This action cannot be undone. The user will lose all access to Creativals OS.
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ background: 'var(--danger)', color: '#fff' }}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteConfirm)}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {modalOpen && (
        <UserFormModal
          user={editUser}
          roles={rolesData || []}
          departments={deptsData || []}
          allUsers={displayUsers}
          onClose={handleCloseModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            handleCloseModal();
            showToast(editUser ? 'User updated successfully.' : 'User invited successfully.', 'success');
          }}
        />
      )}
    </div>
  );
}
