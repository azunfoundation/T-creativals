'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roles as rolesApi, permissions as permissionsApi, getApiErrorMessage } from '@/lib/api';
import type { Role, PermissionsByModule } from '@/lib/api';
import { Save, Lock, Info, ChevronDown, ChevronRight, Plus, Trash2, Copy, X, AlertCircle } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useToast } from '@/hooks/useToast';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

// Only the founder role is protected from editing here — RolePolicy/RoleController
// hard-block renaming/deleting/syncing permissions on it server-side (every Policy's
// before() hook makes founder an unconditional bypass, so its permission set must
// always stay "all permissions"). There is no other seeded "admin" role — a phantom
// 'admin' entry here previously made this lock silently never apply to anything real.
const PROTECTED_ROLE_NAMES = ['founder'];

// Friendlier labels for known permission modules; anything not listed here
// falls back to a capitalized version of the raw module key from the API.
const MODULE_LABELS: Record<string, string> = {
  users: 'Users',
  roles: 'Roles & Permissions',
  departments: 'Departments',
  leads: 'CRM / Leads',
  clients: 'Clients',
  services: 'Services',
  quotes: 'Quotes',
  invoices: 'Invoices',
  projects: 'Projects',
  tasks: 'Tasks',
  timesheets: 'Timesheets',
  attendance: 'Attendance',
  leave: 'Leave',
  holidays: 'Holidays',
  expenses: 'Expenses',
  payroll: 'Payroll',
  reports: 'Reports',
  settings: 'Settings',
  audit: 'Audit Logs',
  recovery: 'Recovery Bin',
};

function moduleLabel(key: string): string {
  return MODULE_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Derive a human-readable label from a permission's name suffix, e.g.
// "leads.view_all" -> "View All", "payroll.approve" -> "Approve".
function permissionLabel(name: string): string {
  const suffix = name.includes('.') ? name.slice(name.indexOf('.') + 1) : name;
  return suffix.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Purely cosmetic, deterministic per-role accent color (the backend doesn't
// store one) so the role list still reads as visually distinct rather than
// every dot rendering the same muted gray.
const ROLE_DOT_PALETTE = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#0ea5e9'];
function roleDotColor(role: Role): string {
  if (role.name === 'founder') return '#7c3aed';
  let hash = 0;
  for (let i = 0; i < role.name.length; i++) hash = (hash * 31 + role.name.charCodeAt(i)) >>> 0;
  return ROLE_DOT_PALETTE[hash % ROLE_DOT_PALETTE.length];
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');

  const {
    data: rolesData,
    isLoading: rolesLoading,
    isError: rolesError,
  } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await rolesApi.list();
      const payload = res.data as unknown;
      return (Array.isArray(payload) ? payload : (payload as { data?: Role[] })?.data ?? []) as Role[];
    },
  });

  const {
    data: permissionsByModule,
    isLoading: permissionsLoading,
    isError: permissionsErrorFlag,
  } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await permissionsApi.list();
      // Real shape is an object keyed by module (e.g. { users: [...] }), not an array.
      return (res.data ?? {}) as PermissionsByModule;
    },
  });

  const roles = rolesData || [];
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const isProtectedRole = !!selectedRole && PROTECTED_ROLE_NAMES.includes(selectedRole.name);

  // Default to the first role once the list loads.
  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  // Sync the checked-permission set whenever the selected role's data changes.
  useEffect(() => {
    if (selectedRole) {
      setSelectedPermissions(new Set((selectedRole.permissions ?? []).map((p) => p.name)));
    }
  }, [selectedRole]);

  // Flatten the API's per-module grouping into a single name -> id map for save/clone.
  const permNameToId = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(permissionsByModule ?? {}).forEach((perms) => {
      perms.forEach((p) => { map[p.name] = p.id; });
    });
    return map;
  }, [permissionsByModule]);

  const totalPermissionCount = useMemo(
    () => Object.values(permissionsByModule ?? {}).reduce((acc, perms) => acc + perms.length, 0),
    [permissionsByModule]
  );

  const saveMutation = useMutation({
    mutationFn: (permIds: number[]) => {
      if (!selectedRole) return Promise.reject(new Error('No role selected.'));
      return rolesApi.syncPermissions(selectedRole.id, permIds);
    },
    onSuccess: () => {
      showToast('Permissions saved successfully!', 'success');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to save permissions.'), 'error');
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) => rolesApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast('Role created successfully!', 'success');
      setIsCreateModalOpen(false);
      setNewRoleName('');
      setNewRoleDescription('');
      const created = res.data as unknown as Role;
      if (created?.id) setSelectedRoleId(created.id);
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to create role.'), 'error');
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; sourcePermIds: number[] }) => {
      const res = await rolesApi.create({ name: data.name, description: data.description });
      const newRole = res.data as unknown as Role;
      if (newRole?.id && data.sourcePermIds.length > 0) {
        await rolesApi.syncPermissions(newRole.id, data.sourcePermIds);
      }
      return newRole;
    },
    onSuccess: (newRole) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast('Role cloned successfully!', 'success');
      setIsCloneModalOpen(false);
      setNewRoleName('');
      setNewRoleDescription('');
      if (newRole?.id) setSelectedRoleId(newRole.id);
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to clone role.'), 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => rolesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast('Role deleted successfully!', 'success');
      setIsDeleteConfirmOpen(false);
      setSelectedRoleId(roles.find((r) => r.id !== selectedRoleId)?.id ?? null);
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to delete role.'), 'error');
      setIsDeleteConfirmOpen(false);
    },
  });

  const togglePermission = (permName: string) => {
    if (isProtectedRole) return;
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permName)) next.delete(permName);
      else next.add(permName);
      return next;
    });
  };

  const toggleModule = (moduleKey: string) => {
    if (isProtectedRole) return;
    const modPerms = (permissionsByModule?.[moduleKey] ?? []).map((p) => p.name);
    const allChecked = modPerms.every((p) => selectedPermissions.has(p));
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      modPerms.forEach((p) => (allChecked ? next.delete(p) : next.add(p)));
      return next;
    });
  };

  const toggleCollapse = (moduleKey: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  const handleSave = () => {
    const permIds = [...selectedPermissions]
      .map((name) => permNameToId[name])
      .filter((id): id is number => id !== undefined);
    saveMutation.mutate(permIds);
  };

  const checkedCount = selectedPermissions.size;
  const isLoading = rolesLoading || permissionsLoading;
  const isError = rolesError || permissionsErrorFlag;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Roles &amp; Permissions</h1>
            <HelpIcon content={{
              what: 'Each role bundles a set of permissions. Assigning a role to a user grants them every permission that role currently has.',
              why: 'Centralizing access control in named roles (instead of per-user checkboxes) keeps a growing team’s access consistent and auditable.',
              when: 'Use this page when a new job function needs different access than any existing role, or when a role’s responsibilities change.',
            }} />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Configure what each role can access across Creativals OS.
          </p>
        </div>
        <HowToUseGuide
          moduleKey="roles_permissions"
          title="Roles & Permissions — How to Use"
          content={{
            overview: 'Roles group permissions together so you can grant access by job function instead of one checkbox at a time.',
            sections: [
              {
                heading: 'Steps',
                items: [
                  'Select a role on the left to see its current permissions.',
                  'Tick or untick individual permissions, or use the module checkbox to toggle a whole group at once.',
                  'Click "Save Permissions" to apply your changes immediately — everyone with that role is affected right away.',
                  'Use "Clone" to start a new role from an existing one’s permission set, or "Add Role" to start from scratch.',
                ],
              },
              {
                heading: 'Tips',
                items: [
                  'The founder role always has every permission and can’t be edited here — this is enforced by the backend, not just hidden in the UI.',
                  'Deleting a role is blocked if any user is currently assigned to it — reassign those users first.',
                ],
              },
              {
                heading: 'Common mistakes',
                items: [
                  'Forgetting that permission changes apply instantly and app-wide, not just to new logins.',
                ],
              },
            ],
          }}
        />
      </div>

      {isError && (
        <div style={{
          marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
          color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
        }}>
          <AlertCircle size={16} />
          Couldn&apos;t load roles/permissions data. Please refresh the page.
        </div>
      )}

      {isLoading && !isError ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading roles and permissions…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Left: Role List */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                {roles.length} Roles
              </p>
              <button
                onClick={() => { setNewRoleName(''); setNewRoleDescription(''); setIsCreateModalOpen(true); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                }}
              >
                <Plus size={12} /> Add Role
              </button>
            </div>
            <div style={{ padding: '0.5rem' }}>
              {roles.map((role) => {
                const isActive = selectedRoleId === role.id;
                const isProtected = PROTECTED_ROLE_NAMES.includes(role.name);
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: isActive ? 'var(--accent-subtle)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: roleDotColor(role), flexShrink: 0 }} />
                      <span style={{ fontSize: '0.875rem', fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {role.display_name || role.name}
                      </span>
                      {typeof role.users_count === 'number' && (
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>({role.users_count})</span>
                      )}
                    </div>
                    {isProtected && <Lock size={11} style={{ color: 'var(--text-muted)' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Permission Matrix */}
          <div>
            {!selectedRole ? (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Select a role to view its permissions.
              </div>
            ) : (
              <>
                <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: roleDotColor(selectedRole) }} />
                        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {selectedRole.display_name || selectedRole.name}
                        </h2>
                        {isProtectedRole && (
                          <span className="badge badge-accent" style={{ gap: '0.25rem', display: 'inline-flex', alignItems: 'center' }}>
                            <Lock size={9} /> Protected Role
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {checkedCount} of {totalPermissionCount} permissions granted
                        {typeof selectedRole.users_count === 'number' && ` · ${selectedRole.users_count} user(s) assigned`}
                      </p>
                      {selectedRole.description && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0, fontStyle: 'italic' }}>
                          {selectedRole.description}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {!isProtectedRole && (
                        <button
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="btn btn-secondary"
                          style={{ padding: '0.5rem', background: 'none', border: '1px solid var(--danger-subtle)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Delete Role"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setNewRoleName(`${selectedRole.name}_copy`);
                          setNewRoleDescription(`Clone of ${selectedRole.display_name || selectedRole.name}. ${selectedRole.description || ''}`);
                          setIsCloneModalOpen(true);
                        }}
                        className="btn btn-secondary"
                        style={{ gap: '0.25rem', display: 'flex', alignItems: 'center' }}
                        title="Clone Role"
                      >
                        <Copy size={14} />
                        <span>Clone</span>
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isProtectedRole || saveMutation.isPending}
                        className="btn btn-primary"
                        style={{ gap: '0.5rem', display: 'flex', alignItems: 'center' }}
                      >
                        <Save size={15} />
                        {saveMutation.isPending ? 'Saving…' : 'Save Permissions'}
                      </button>
                    </div>
                  </div>

                  {isProtectedRole && (
                    <div style={{
                      marginTop: '0.75rem', padding: '0.625rem 0.875rem',
                      background: 'var(--info-subtle)', border: '1px solid var(--info)',
                      borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                      color: 'var(--info)', fontSize: '0.8125rem',
                    }}>
                      <Info size={14} />
                      This role always has every permission and cannot be modified.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.entries(permissionsByModule ?? {}).map(([moduleKey, perms]) => {
                    const modPerms = perms.map((p) => p.name);
                    const allChecked = modPerms.length > 0 && modPerms.every((p) => selectedPermissions.has(p));
                    const someChecked = modPerms.some((p) => selectedPermissions.has(p));
                    const checkedInModule = modPerms.filter((p) => selectedPermissions.has(p)).length;
                    const isCollapsed = collapsedModules.has(moduleKey);

                    return (
                      <div key={moduleKey} className="card" style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCollapsed ? 0 : '0.875rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <input
                              type="checkbox"
                              id={`module-${moduleKey}`}
                              checked={allChecked}
                              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                              onChange={() => toggleModule(moduleKey)}
                              disabled={isProtectedRole}
                              style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: isProtectedRole ? 'not-allowed' : 'pointer' }}
                            />
                            <label htmlFor={`module-${moduleKey}`} style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', cursor: isProtectedRole ? 'not-allowed' : 'pointer' }}>
                              {moduleLabel(moduleKey)}
                            </label>
                            <span style={{
                              fontSize: '0.6875rem', fontWeight: 600,
                              background: checkedInModule > 0 ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                              color: checkedInModule > 0 ? 'var(--accent)' : 'var(--text-muted)',
                              padding: '1px 6px', borderRadius: '9999px',
                              border: `1px solid ${checkedInModule > 0 ? 'rgba(124,58,237,0.3)' : 'transparent'}`,
                            }}>
                              {checkedInModule}/{modPerms.length}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleCollapse(moduleKey)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}
                            title={isCollapsed ? 'Expand' : 'Collapse'}
                          >
                            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </div>

                        {!isCollapsed && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                            {perms.map((perm) => (
                              <label
                                key={perm.name}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                                  padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                                  background: selectedPermissions.has(perm.name) ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                                  border: `1px solid ${selectedPermissions.has(perm.name) ? 'rgba(124,58,237,0.3)' : 'transparent'}`,
                                  cursor: isProtectedRole ? 'not-allowed' : 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPermissions.has(perm.name)}
                                  onChange={() => togglePermission(perm.name)}
                                  disabled={isProtectedRole}
                                  style={{ accentColor: 'var(--accent)', width: 13, height: 13 }}
                                />
                                <span style={{
                                  fontSize: '0.8125rem',
                                  color: selectedPermissions.has(perm.name) ? 'var(--accent)' : 'var(--text-secondary)',
                                  fontWeight: selectedPermissions.has(perm.name) ? 500 : 400,
                                }}>
                                  {permissionLabel(perm.name)}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE ROLE MODAL ─────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setIsCreateModalOpen(false)}>
          <div style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', maxWidth: 450, width: '100%', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Create Custom Role</h3>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const slug = newRoleName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
              createMutation.mutate({ name: slug, description: newRoleDescription });
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Role Key Name *</label>
                <input required type="text" placeholder="e.g. support-agent" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="form-input" />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Lowercased and slugified automatically. Starts with zero permissions — add them after creating.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea placeholder="Brief description of the role's purpose..." value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} className="form-input" style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn btn-primary">
                  {createMutation.isPending ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CLONE ROLE MODAL ──────────────────────────────────────── */}
      {isCloneModalOpen && selectedRole && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setIsCloneModalOpen(false)}>
          <div style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', maxWidth: 450, width: '100%', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Clone Role: {selectedRole.display_name || selectedRole.name}</h3>
              <button onClick={() => setIsCloneModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const slug = newRoleName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
              const permIds = [...selectedPermissions]
                .map((name) => permNameToId[name])
                .filter((id): id is number => id !== undefined);
              cloneMutation.mutate({ name: slug, description: newRoleDescription, sourcePermIds: permIds });
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">New Role Key Name *</label>
                <input required type="text" placeholder="e.g. support-agent" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="form-input" />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Lowercased and slugified automatically. Starts with a copy of {selectedRole.display_name || selectedRole.name}&apos;s current permissions.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea placeholder="Brief description of the role's purpose..." value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} className="form-input" style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsCloneModalOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={cloneMutation.isPending} className="btn btn-primary">
                  {cloneMutation.isPending ? 'Cloning...' : 'Clone Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE ROLE CONFIRM ───────────────────────────────────── */}
      {isDeleteConfirmOpen && selectedRole && (
        <ConfirmModal
          title={`Delete Role: ${selectedRole.display_name || selectedRole.name}`}
          message={`Are you sure you want to permanently delete the custom role '${selectedRole.display_name || selectedRole.name}'? This action cannot be undone and will fail if the role is currently assigned to users.`}
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => deleteMutation.mutate(selectedRole.id)}
          onCancel={() => setIsDeleteConfirmOpen(false)}
        />
      )}
    </div>
  );
}
