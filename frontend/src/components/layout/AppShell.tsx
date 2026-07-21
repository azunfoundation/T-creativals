'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard, Users, Building2, Package, FileText, Receipt,
  FolderKanban, CheckSquare, Clock, Calendar, CreditCard,
  Banknote, BarChart3, Settings, ChevronLeft, ChevronRight,
  Search, Bell, Sun, Moon, LogOut, User, ChevronDown,
  UserCog, ShieldCheck, Sparkles, Briefcase,
  DollarSign, Shield, Plus,
  Zap, Home, ArrowRight, Command, Menu, X,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { alerts as alertsApi, platformSettings as settingsApi, SystemSettings } from '@/lib/api';
import AlertsDrawer from './AlertsDrawer';
import { StickyProjectSwitcher } from './StickyProjectSwitcher';

// -- Navigation Groups ---------------------------------------------
interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  permissions?: string[];
  aiFlag?: boolean;
}

interface NavGroup {
  id: string;
  label: string | null;
  icon?: React.ElementType;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    label: null,
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { label: 'CRM / Leads', icon: Users,      href: '/crm',      permissions: ['leads.view'] },
      { label: 'Clients',     icon: Building2,  href: '/clients',  permissions: ['clients.view'] },
      { label: 'Quotes',      icon: FileText,   href: '/quotes',   permissions: ['quotes.view'] },
      { label: 'Invoices',    icon: Receipt,    href: '/invoices', permissions: ['invoices.view'] },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { label: 'Services',   icon: Package,      href: '/services',   permissions: ['services.view'] },
      { label: 'Projects',   icon: FolderKanban, href: '/projects',   permissions: ['projects.view'] },
      { label: 'Tasks',      icon: CheckSquare,  href: '/tasks',      permissions: ['tasks.view'] },
      { label: 'Timesheets', icon: Clock,        href: '/timesheets', permissions: ['timesheets.view'] },
      { label: 'Attendance', icon: Calendar,     href: '/attendance' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { label: 'Expenses', icon: CreditCard, href: '/expenses', permissions: ['expenses.view'] },
      { label: 'Payroll',  icon: Banknote,   href: '/payroll',  permissions: ['payroll.view'] },
      { label: 'Reports',  icon: BarChart3,  href: '/reports',  permissions: ['reports.view'] },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { label: 'Users',       icon: UserCog,     href: '/users',       permissions: ['users.view'] },
      { label: 'Roles',       icon: ShieldCheck, href: '/roles',       permissions: ['roles.view'] },
      { label: 'Departments', icon: Building2,   href: '/departments', permissions: ['departments.view'] },
      { label: 'Settings',    icon: Settings,    href: '/settings' },
    ],
  },
  {
    id: 'ai',
    label: null,
    items: [
      { label: 'AI Assistant', icon: Sparkles, href: '/ai', aiFlag: true },
    ],
  },
];

// Flat list for command palette
const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Quick create actions
// NOTE: /xxx/new routes do not exist — list pages open their create modal via
// ?new=true, and invoices/quotes have dedicated /create pages.
// Each action carries the same permission string the backend enforces, so
// the menu never offers a create the server would 403. "New Expense" has no
// requirement — any employee may log their own expenses.
const QUICK_CREATE_ACTIONS = [
  { label: 'New Lead',    icon: Users,        href: '/crm?new=true',      color: '#7c3aed', permissions: ['leads.create'] },
  { label: 'New Client',  icon: Building2,    href: '/clients',           color: '#2563eb', permissions: ['clients.create'] },
  { label: 'New Project', icon: FolderKanban, href: '/projects?new=true', color: '#059669', permissions: ['projects.create'] },
  { label: 'New Task',    icon: CheckSquare,  href: '/tasks?new=true',    color: '#d97706', permissions: ['tasks.create'] },
  { label: 'New Invoice', icon: Receipt,      href: '/invoices/create',   color: '#dc2626', permissions: ['invoices.create'] },
  { label: 'New Expense', icon: CreditCard,   href: '/expenses?new=true', color: '#7c3aed', permissions: undefined as string[] | undefined },
];

// Breadcrumb segment label map
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', crm: 'CRM', clients: 'Clients', services: 'Services',
  quotes: 'Quotes', invoices: 'Invoices', projects: 'Projects', tasks: 'Tasks',
  timesheets: 'Timesheets', attendance: 'Attendance', expenses: 'Expenses',
  payroll: 'Payroll', reports: 'Reports', ai: 'AI Assistant', users: 'Users',
  roles: 'Roles', settings: 'Settings', new: 'New', edit: 'Edit',
  departments: 'Departments',
};

function useBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((seg, i) => ({
    label: SEGMENT_LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));
}

const playChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const playTone = (time: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };
    const now = ctx.currentTime;
    playTone(now, 523.25, 0.4);
    playTone(now + 0.12, 659.25, 0.5);
  } catch (e) {
    console.error('Failed to play chime:', e);
  }
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, logout } = useAuthStore();

  const hasPermission = useCallback((permissions?: string[]) => {
    if (!user) return false;
    const userRoles = user.roles.map((r: any) => typeof r === 'string' ? r : r?.name || '');
    if (userRoles.includes('founder') || userRoles.includes('director')) return true;
    if (!permissions || permissions.length === 0) return true;
    const userPermissions = user.permissions || [];
    return userPermissions.some((p: string) => permissions.includes(p));
  }, [user]);

  const aiEnabled = process.env.NEXT_PUBLIC_AI_ENABLED !== 'false';

  // Same visibility rule (permission + AI flag) the sidebar applies, reused for
  // the command palette so both surfaces agree on what's navigable.
  const isNavItemVisible = useCallback((item: NavItem) => {
    if (item.aiFlag && !aiEnabled) return false;
    return hasPermission(item.permissions);
  }, [hasPermission, aiEnabled]);

  const visibleNavItems = useMemo(
    () => ALL_NAV_ITEMS.filter(isNavItemVisible),
    [isNavItemVisible]
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    sales: true, operations: true, finance: true, admin: true,
  });
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [logoImageError, setLogoImageError] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const quickCreateRef = useRef<HTMLDivElement>(null);
  const prevUnreadIdsRef = useRef<Set<number>>(new Set());
  const isFirstLoadRef = useRef(true);

  const { data: alerts = [] } = useQuery<any[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      try {
        const res = await alertsApi.list();
        const payload = res.data as any;
        if (payload && Array.isArray(payload.data)) return payload.data;
        return Array.isArray(payload) ? payload : [];
      } catch { return []; }
    },
    refetchInterval: 10000,
  });

  const unreadAlerts = useMemo(() => alerts.filter((a: any) => !a.read), [alerts]);
  const unreadIds = useMemo(() => new Set(unreadAlerts.map((a: any) => a.id)), [unreadAlerts]);

  useEffect(() => {
    if (isFirstLoadRef.current) {
      if (alerts.length > 0) {
        prevUnreadIdsRef.current = unreadIds;
        isFirstLoadRef.current = false;
      }
      return;
    }

    let hasNew = false;
    for (const id of unreadIds) {
      if (!prevUnreadIdsRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }

    if (hasNew) {
      const soundEnabled = localStorage.getItem('notification_sound_enabled') !== 'false';
      if (soundEnabled) {
        playChime();
      }
    }

    prevUnreadIdsRef.current = unreadIds;
  }, [unreadIds, alerts]);

  const unreadCount = unreadAlerts.length;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { data: settings } = useQuery<SystemSettings>({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data;
    },
  });

  useEffect(() => {
    setLogoImageError(false);
  }, [settings?.company?.logo_url]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen((p) => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) setQuickCreateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => { await logout(); router.replace('/login'); };
  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  const toggleGroup = (id: string) => setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  const breadcrumbs = useBreadcrumbs(pathname);
  const sidebarWidth = collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <>
      <div className="app-shell">

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div
            className="mobile-sidebar-overlay"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(mobileMenuOpen && 'mobile-open')}
          style={{
            width: sidebarWidth,
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            flexShrink: 0, overflow: 'hidden',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >

          {/* Workspace Header */}
          <div className="sidebar-workspace">
            <div className="workspace-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {settings?.company?.logo_url && !logoImageError ? (
                <img 
                  src={settings.company.logo_url} 
                  alt="Logo" 
                  onError={() => setLogoImageError(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
              ) : (
                <Zap size={13} color="#fff" strokeWidth={2.5} />
              )}
            </div>
            {!collapsed && (
              <>
                <span className="workspace-name">
                  {settings?.company?.company_name || 'Creativals OS'}
                </span>
                <ChevronDown size={13} className="workspace-chevron" />
              </>
            )}
            {/* Mobile close button */}
            <button
              className="sidebar-close-btn mobile-only"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X size={15} />
            </button>
          </div>

          {/* Nav */}
          <nav className="sidebar-nav">
            {NAV_GROUPS.filter((group) => group.items.some(isNavItemVisible)).map((group) => {
              const visibleItems = group.items.filter(isNavItemVisible);
              const isExpanded = group.label ? (expandedGroups[group.id] !== false) : true;

              return (
                <div key={group.id} className="nav-section">
                  {group.label && !collapsed && (
                    <div
                      className="nav-group-header"
                      onClick={() => toggleGroup(group.id)}
                      role="button"
                      aria-expanded={isExpanded}
                    >
                      <span className="nav-group-label">{group.label}</span>
                      <ChevronRight
                        size={12}
                        className={cn('nav-group-chevron', isExpanded && 'expanded')}
                      />
                    </div>
                  )}

                  {(isExpanded || !group.label) && (
                    <div className={group.label ? 'nav-group-items' : undefined}>
                      {visibleItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            className={cn('nav-item-v2', collapsed && 'collapsed-icon', isActive && 'active')}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Icon size={collapsed ? 16 : 15} className="nav-item-icon-v2" />
                            {!collapsed && <span>{item.label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="sidebar-footer">
            {user && (
              <div
                className="sidebar-user"
                title={collapsed ? user.name : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : getInitials(user.name)
                  }
                </div>
                {!collapsed && (
                  <>
                    <div className="sidebar-user-info">
                      <div className="sidebar-user-name">{user.name}</div>
                      <div className="sidebar-user-role">{user.roles[0]?.display_name || 'User'}</div>
                    </div>
                    <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </>
                )}
              </div>
            )}

            {/* Mobile-only theme toggle */}
            <button
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="sidebar-theme-toggle-btn mobile-only"
            >
              {mounted && resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>Toggle Theme</span>
            </button>

            {/* Collapse button (desktop-only class added) */}
            <button
              onClick={() => setCollapsed((p) => !p)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="sidebar-collapse-btn desktop-only"
            >
              {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
            </button>
          </div>
        </aside>

        {/* Main Area */}
        <div className="main-area">

          {/* Premium Topbar */}
          <header className="topbar-v2">

            {/* Mobile Menu Button */}
            <button
              className="topbar-mobile-menu-btn mobile-only"
              onClick={() => setMobileMenuOpen(true)}
              title="Open Menu"
              aria-label="Open Menu"
            >
              <Menu size={16} />
            </button>

            {/* Breadcrumb */}
            <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
              <Link href="/dashboard" className="topbar-breadcrumb-item" title="Home" onClick={() => setMobileMenuOpen(false)}>
                <Home size={13} />
              </Link>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <ChevronRight size={11} style={{ color: 'var(--border)' }} />
                  {crumb.isLast
                    ? <span className="topbar-breadcrumb-item current">{crumb.label}</span>
                    : <Link href={crumb.href} className="topbar-breadcrumb-item" onClick={() => setMobileMenuOpen(false)}>{crumb.label}</Link>
                  }
                </span>
              ))}
            </nav>

            <div className="topbar-spacer" />

            {/* Search */}
            <button
              id="cmd-palette-trigger"
              className="topbar-search"
              onClick={() => setCmdOpen(true)}
              title="Search (Ctrl+K)"
            >
              <Search size={14} />
              <span className="topbar-search-label">Search anything...</span>
              <kbd className="topbar-kbd">?K</kbd>
            </button>

            <div className="topbar-spacer" />

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>

              {/* Sticky Project Switcher */}
              <StickyProjectSwitcher />

              {/* Quick Create */}
              <div ref={quickCreateRef} style={{ position: 'relative' }}>
                <button
                  id="quick-create-trigger"
                  className="quick-create-btn"
                  onClick={() => setQuickCreateOpen((p) => !p)}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span>New</span>
                  <ChevronDown size={12} />
                </button>
                {quickCreateOpen && (
                  <div className="quick-create-menu">
                    <div className="quick-create-section-label">Create New</div>
                    {QUICK_CREATE_ACTIONS.filter((action) => hasPermission(action.permissions)).map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link
                          key={action.href}
                          href={action.href}
                          className="quick-create-item"
                          onClick={() => setQuickCreateOpen(false)}
                        >
                          <span style={{
                            width: 24, height: 24, borderRadius: 6,
                            background: action.color + '18',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Icon size={13} style={{ color: action.color }} />
                          </span>
                          {action.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* AI */}
              {aiEnabled && (
                <Link href="/ai">
                  <button className="topbar-ai-btn" title="AI Assistant">
                    <Sparkles size={13} />
                    <span>AI</span>
                  </button>
                </Link>
              )}

              {/* Theme */}
              <button
                id="theme-toggle"
                onClick={toggleTheme}
                title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
                className="topbar-icon-btn"
              >
                {mounted && resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              {/* Bell */}
              <button
                id="alerts-bell"
                onClick={() => setAlertsOpen(true)}
                className="topbar-icon-btn"
                title={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="topbar-notif-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              <div className="topbar-divider" />

              {/* User Menu */}
              <div ref={userMenuRef} style={{ position: 'relative' }}>
                <button
                  id="user-menu-trigger"
                  className="topbar-user-btn"
                  onClick={() => setUserMenuOpen((p) => !p)}
                >
                  <div className="avatar avatar-sm">
                    {user?.avatar_url
                      ? <img src={user.avatar_url} alt={user?.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : getInitials(user?.name || 'U')
                    }
                  </div>
                  <span className="topbar-user-name">{user?.name?.split(' ')[0] || 'User'}</span>
                  <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
                </button>

                {userMenuOpen && (
                  <div className="topbar-user-menu">
                    <div className="topbar-user-menu-header">
                      <div className="topbar-user-menu-name">{user?.name}</div>
                      <div className="topbar-user-menu-email">{user?.email}</div>
                      <div style={{ marginTop: '0.375rem' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: '0.6875rem', fontWeight: 600,
                          background: 'var(--accent-subtle)', color: 'var(--accent)',
                          padding: '2px 8px', borderRadius: 9999,
                        }}>
                          {user?.roles?.[0]?.display_name || 'User'}
                        </span>
                      </div>
                    </div>
                    <div className="topbar-user-menu-items">
                      <Link href="/settings/profile" className="topbar-menu-item" onClick={() => { setUserMenuOpen(false); setMobileMenuOpen(false); }}>
                        <User size={14} /> Profile & Account
                      </Link>
                      <Link href="/settings" className="topbar-menu-item" onClick={() => { setUserMenuOpen(false); setMobileMenuOpen(false); }}>
                        <Settings size={14} /> Workspace Settings
                      </Link>
                      <div className="topbar-menu-divider" />
                      <button id="logout-btn" onClick={handleLogout} className="topbar-menu-item danger">
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="page-content">{children}</main>
        </div>
      </div>

      {/* Command Palette */}
      {cmdOpen && (
        <CommandPaletteV2
          navItems={visibleNavItems}
          onClose={() => setCmdOpen(false)}
          onNavigate={(href) => { setCmdOpen(false); router.push(href); }}
        />
      )}

      {/* Alerts Drawer */}
      {alertsOpen && (
        <AlertsDrawer open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      )}
    </>
  );
}

// -- Premium Command Palette V2 ------------------------------------
function CommandPaletteV2({ navItems, onClose, onNavigate }: { navItems: NavItem[]; onClose: () => void; onNavigate: (href: string) => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const QUICK_ACTIONS_CMD = [
    { label: 'New Lead',    desc: 'Create a CRM lead',   href: '/crm?new=true',      icon: Users },
    { label: 'New Invoice', desc: 'Create an invoice',   href: '/invoices/create',   icon: Receipt },
    { label: 'New Project', desc: 'Start a new project', href: '/projects?new=true', icon: FolderKanban },
    { label: 'New Task',    desc: 'Add a task',          href: '/tasks?new=true',    icon: CheckSquare },
    { label: 'New Expense', desc: 'Log an expense',      href: '/expenses?new=true', icon: CreditCard },
  ];

  const filteredNav = navItems.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()));
  const filteredActions = QUICK_ACTIONS_CMD.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()) || a.desc.toLowerCase().includes(query.toLowerCase())
  );
  const hasResults = filteredNav.length > 0 || filteredActions.length > 0;

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-modal-v2" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-search-row">
          <Command size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, actions, people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="cmdk-search-input"
          />
          <kbd className="topbar-kbd">ESC</kbd>
        </div>

        <div className="cmdk-results">
          {!hasResults && (
            <div className="cmdk-empty">
              {query ? `No results for "${query}"` : 'Start typing to search...'}
            </div>
          )}
          {filteredNav.length > 0 && (
            <div>
              <div className="cmdk-group-label">Navigation</div>
              {filteredNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.href} className="cmdk-item" onClick={() => onNavigate(item.href)}>
                    <span className="cmdk-item-icon"><Icon size={14} /></span>
                    <span className="cmdk-item-label">{item.label}</span>
                    <ArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
          {filteredActions.length > 0 && (
            <div>
              <div className="cmdk-group-label">Quick Actions</div>
              {filteredActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.href} className="cmdk-item" onClick={() => onNavigate(action.href)}>
                    <span className="cmdk-item-icon"><Icon size={14} /></span>
                    <span className="cmdk-item-label">
                      {action.label}
                      <div className="cmdk-item-desc">{action.desc}</div>
                    </span>
                    <ArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="cmdk-footer">
          <span className="cmdk-footer-hint"><kbd className="topbar-kbd">??</kbd> Navigate</span>
          <span className="cmdk-footer-hint"><kbd className="topbar-kbd">?</kbd> Open</span>
          <span className="cmdk-footer-hint"><kbd className="topbar-kbd">ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
