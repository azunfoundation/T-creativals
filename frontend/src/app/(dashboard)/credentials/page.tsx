'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound, Search, Plus, Star, Eye, EyeOff, Copy, ExternalLink,
  MoreVertical, Settings, Check, CheckSquare, Square, Trash2, Archive,
  SlidersHorizontal, ChevronLeft, ChevronRight, AlertCircle, CopyCheck,
  Globe, Database, Shield, LayoutDashboard, Terminal, RefreshCw, Upload, Download
} from 'lucide-react';
import { credentialsApi, clientsApi, getApiErrorMessage } from '@/lib/api';
import type { ClientCredential } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

// Render official brand SVG icons for the table rows
function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  
  if (p.includes('wordpress')) {
    return (
      <svg className="w-5 h-5 text-sky-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.158 12.786l-2.698 7.84c.806.236 1.657.365 2.54.365 1.047 0 2.05-.179 2.986-.51l-2.828-7.695zm-5.46-4.945c.01-.22.094-.652.272-1.047.25-.502.66-.942 1.34-1.256 1.488-.69 3.992-.47 3.992-.47s-2.02.042-3.34.69c-.65.315-.995.734-1.12 1.1-.19.555-.262 1.256-.23 2.115l1.642 9.42c-1.545-1.183-2.67-2.91-3.136-4.93L6.7 7.84zm7.62 1.832c0-1.1-.397-1.854-.733-2.45-.45-.754-.87-1.393-.87-2.146 0-.858.66-1.65 1.593-1.65.45 0 .86.136 1.15.356-.848-.094-1.65.47-1.65 1.445 0 .723.42 1.33.848 1.948.493.722.996 1.487.996 2.65 0 .89-.325 1.822-.64 2.65l-1.393 4.293 2.3-7.096zm-1.058 8.083l2.252-6.906c.262-.785.45-1.393.45-1.927 0-.91-.534-1.54-1.288-1.54-.628 0-1.246.43-1.54.995l-.335.69-1.64 5.045 2.1 6.643zM12 0a12 12 0 100 24 12 12 0 000-24zm0 22.8c-5.96 0-10.8-4.84-10.8-10.8 0-2.315.733-4.46 1.98-6.223l5.804 16.71c-.324.135-.654.24-.99.313h.006zm9.245-7.1c-.24-.712-.86-2.22-1.666-3.856l-1.288 3.76c1.194.272 2.378.115 2.954.096z" />
      </svg>
    );
  }
  if (p.includes('cpanel') || p.includes('whm')) {
    return (
      <svg className="w-5 h-5 text-orange-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-3 18h-2v-4h2v4zm4 0h-2V6h2v12zm4 0h-2v-7h2v7z" />
      </svg>
    );
  }
  if (p.includes('google') || p.includes('ads') || p.includes('analytics')) {
    return (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
      </svg>
    );
  }
  if (p.includes('instagram')) {
    return (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#e1306c' }}>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }
  if (p.includes('facebook') || p.includes('meta')) {
    return (
      <svg className="w-5 h-5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (p.includes('stripe')) {
    return (
      <svg className="w-5 h-5 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.962 10.875c0-1.03-.84-1.39-2.083-1.39-1.575 0-2.836.428-3.953.94l-.626-4.043c1.238-.535 2.894-.852 4.673-.852 4.417 0 6.643 2.148 6.643 5.48 0 4.148-3.583 5.166-5.842 5.92-.888.293-2.05.656-2.05 1.258 0 1.077.986 1.488 2.378 1.488 1.83 0 3.329-.628 4.413-1.22l.626 4.093c-1.267.65-3.09 1.026-4.992 1.026-4.57 0-7.079-2.226-7.079-5.632 0-4.032 3.659-5.127 5.908-5.877 1-.33 2-.693 2-1.19z" />
      </svg>
    );
  }
  if (p.includes('shopify')) {
    return (
      <svg className="w-5 h-5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.847 4.12l-7.79-2.903a.754.754 0 00-.514 0L2.753 4.12A.753.753 0 002.25 4.83v12.28c0 .285.162.545.42.665l7.79 3.627c.17.078.362.078.532 0l7.79-3.627a.753.753 0 00.418-.665V4.83a.753.753 0 00-.503-.71z" />
      </svg>
    );
  }
  if (p.includes('cloudflare')) {
    return (
      <svg className="w-5 h-5 text-orange-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a9 9 0 00-9 9 9 9 0 009 9 9 9 0 009-9 9 9 0 00-9-9zm5.352 11.23a2.316 2.316 0 01-.137.608 1.954 1.954 0 01-1.282 1.282c-.198.055-.404.08-.609.073h-7.14a2.348 2.348 0 01-1.656-.687A2.348 2.348 0 016 13.85c0-.986.608-1.848 1.528-2.185.025-.572.2-1.12.508-1.597A3.242 3.242 0 019.53 8.783a4.542 4.542 0 014.249.006c.642.349 1.173.87 1.528 1.503a2.3 2.3 0 011.516.753c.348.375.529.873.509 1.385a2.296 2.296 0 01.02.8zm0 0" />
      </svg>
    );
  }
  if (p.includes('zoho') || p.includes('mail')) {
    return <Globe className="w-5 h-5 text-teal-600 shrink-0" />;
  }
  if (p.includes('ssh') || p.includes('terminal')) {
    return <Terminal className="w-5 h-5 text-gray-400 shrink-0" />;
  }
  if (p.includes('ftp') || p.includes('server')) {
    return <Database className="w-5 h-5 text-blue-500 shrink-0" />;
  }
  if (p.includes('api') || p.includes('key') || p.includes('token')) {
    return <KeyRound className="w-5 h-5 text-purple-500 shrink-0" />;
  }
  
  return <Shield className="w-5 h-5 text-gray-500 shrink-0" />;
}

export default function CredentialsVaultPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Page query params state
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [clientFilter, setClientFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showArchived, setShowArchived] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    favorite: true,
    client: true,
    platform: true,
    type: true,
    username: true,
    password: true,
    url: true,
    tags: true,
    updated: true,
  });

  // Table Column Widths state (for resizable columns)
  const [columnWidths, setColumnWidths] = useState({
    select: 45,
    favorite: 50,
    client: 180,
    platform: 220,
    type: 120,
    username: 180,
    password: 180,
    url: 240,
    tags: 160,
    updated: 160,
    actions: 120,
  });

  // Row selection state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Password visibility tracking state
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: number; field: string; value: string } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [credentialForm, setCredentialForm] = useState({
    client_name: '',
    platform: '',
    credential_type: 'Website',
    username: '',
    password: '',
    login_url: '',
    notes: '',
    tags: '',
    is_favorite: false,
  });

  // Dropdown menus states
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [showMoreTabs, setShowMoreTabs] = useState(false);

  // Fetch credentials
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['credentials', { search, tab, clientFilter, platformFilter, typeFilter, sortBy, sortDir, page, perPage, showArchived }],
    queryFn: async () => {
      const res = await credentialsApi.list({
        search: search || undefined,
        tab: tab === 'all' ? undefined : tab,
        client_name_filter: clientFilter || undefined,
        platform_filter: platformFilter || undefined,
        type_filter: typeFilter || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        per_page: perPage,
        archived: showArchived,
      });
      return res.data;
    },
  });

  const credentials = data?.data || [];
  const meta = data?.meta || { current_page: 1, last_page: 1, per_page: 25, total: 0 };
  const stats = data?.stats || { total_credentials: 0, favorite_credentials: 0, recently_used: 0 };
  const filters = data?.filters || { clients: [], platforms: [], types: [] };

  // Fetch all clients from backend to support client dropdown selection in the Add Credential modal
  const { data: clientsData } = useQuery({
    queryKey: ['clients_list_credentials'],
    queryFn: async () => (await clientsApi.list()).data,
  });
  const systemClients = clientsData?.breakdown || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: typeof credentialForm) => credentialsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setShowAddModal(false);
      setCredentialForm({
        client_name: '',
        platform: '',
        credential_type: 'Website',
        username: '',
        password: '',
        login_url: '',
        notes: '',
        tags: '',
        is_favorite: false,
      });
      showToast('Credential added successfully', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to add credential'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ClientCredential> }) => credentialsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to update credential'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => credentialsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setShowDeleteConfirm(null);
      showToast('Credential deleted permanently', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to delete credential'), 'error'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => credentialsApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      showToast('Credential duplicated successfully', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to duplicate credential'), 'error'),
  });

  const logUsageMutation = useMutation({
    mutationFn: (id: number) => credentialsApi.logUsage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: (ids: number[]) => credentialsApi.bulkArchive(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setSelectedIds([]);
      showToast(res.data.message || 'Credentials archived successfully', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to archive credentials'), 'error'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => credentialsApi.bulkDelete(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      showToast(res.data.message || 'Credentials deleted successfully', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to delete credentials'), 'error'),
  });

  const importMutation = useMutation({
    mutationFn: (credentialsList: any[]) => credentialsApi.import(credentialsList),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setShowImportModal(false);
      setImportText('');
      setImportError('');
      showToast(res.data.message || 'Credentials imported successfully', 'success');
    },
    onError: (err) => setImportError(getApiErrorMessage(err, 'Import failed. Check format.')),
  });

  // Handle Clipboard Copy
  const copyToClipboard = (text: string, type: 'username' | 'password', id: number) => {
    navigator.clipboard.writeText(text);
    showToast(`${type === 'username' ? 'Username' : 'Password'} copied to clipboard!`, 'success');
    logUsageMutation.mutate(id);
  };

  // Toggle Favorite
  const toggleFavorite = (id: number, currentFav: boolean) => {
    updateMutation.mutate({ id, payload: { is_favorite: !currentFav } });
  };

  // Toggle Archived for row
  const archiveRow = (id: number) => {
    updateMutation.mutate({ id, payload: { is_archived: true } });
    showToast('Credential archived successfully', 'success');
  };

  // Handle Sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  // Handle Bulk Selection
  const toggleSelectAll = () => {
    if (selectedIds.length === credentials.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(credentials.map((c) => c.id));
    }
  };

  const toggleSelectRow = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Resizable columns logic
  const resizeStart = useRef<{ col: string; startWidth: number; startX: number } | null>(null);

  const onColumnResizeMouseDown = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizeStart.current = {
      col,
      startWidth: columnWidths[col as keyof typeof columnWidths],
      startX: e.clientX,
    };
    document.addEventListener('mousemove', onColumnResizeMouseMove);
    document.addEventListener('mouseup', onColumnResizeMouseUp);
  };

  const onColumnResizeMouseMove = (e: MouseEvent) => {
    if (!resizeStart.current) return;
    const { col, startWidth, startX } = resizeStart.current;
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(40, startWidth + deltaX);
    setColumnWidths((prev) => ({
      ...prev,
      [col]: newWidth,
    }));
  };

  const onColumnResizeMouseUp = () => {
    resizeStart.current = null;
    document.removeEventListener('mousemove', onColumnResizeMouseMove);
    document.removeEventListener('mouseup', onColumnResizeMouseUp);
  };

  // Inline edit saving
  const handleInlineEditSave = () => {
    if (!editingCell) return;
    const { id, field, value } = editingCell;
    updateMutation.mutate({ id, payload: { [field]: value } });
    setEditingCell(null);
  };

  const handleInlineEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInlineEditSave();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // JSON Export trigger
  const handleExport = () => {
    if (credentials.length === 0) {
      showToast('No credentials to export', 'error');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(credentials, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `creativals_credentials_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Credentials exported successfully!', 'success');
  };

  // JSON Import parser
  const handleImportSubmit = () => {
    try {
      const parsed = JSON.parse(importText);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      if (list.length === 0) {
        setImportError('JSON array cannot be empty.');
        return;
      }
      importMutation.mutate(list);
    } catch (e) {
      setImportError('Invalid JSON format. Must be a valid JSON array of credential objects.');
    }
  };

  // Extra platform tabs helper
  const morePlatforms = ['cloudflare', 'email', 'apis', 'other'];

  // Total grid template widths mapping
  const gridTemplateColumns = useMemo(() => {
    let cols = [];
    cols.push(`${columnWidths.select}px`);
    if (visibleColumns.favorite) cols.push(`${columnWidths.favorite}px`);
    if (visibleColumns.client) cols.push(`${columnWidths.client}px`);
    if (visibleColumns.platform) cols.push(`${columnWidths.platform}px`);
    if (visibleColumns.type) cols.push(`${columnWidths.type}px`);
    if (visibleColumns.username) cols.push(`${columnWidths.username}px`);
    if (visibleColumns.password) cols.push(`${columnWidths.password}px`);
    if (visibleColumns.url) cols.push(`${columnWidths.url}px`);
    if (visibleColumns.tags) cols.push(`${columnWidths.tags}px`);
    if (visibleColumns.updated) cols.push(`${columnWidths.updated}px`);
    cols.push(`${columnWidths.actions}px`);
    return cols.join(' ');
  }, [columnWidths, visibleColumns]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem', height: 'calc(100vh - var(--topbar-height))', overflowY: 'auto' }}>
      <style>{`
        .table-row {
          transition: background-color 150ms ease;
        }
        .table-row:hover {
          background-color: var(--surface-hover) !important;
        }
        .bg-zebra {
          background-color: var(--border-subtle) !important;
        }
        .bg-selected {
          background-color: var(--accent-subtle) !important;
        }
        .copy-btn {
          opacity: 0;
          transition: opacity 0.15s ease-in-out;
        }
        .table-row:hover .copy-btn {
          opacity: 1;
        }
        .resize-handle {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          cursor: col-resize;
          background-color: transparent;
          transition: background-color 0.15s;
          z-index: 2;
        }
        .resize-handle:hover,
        .resize-handle:active {
          background-color: var(--accent);
        }
      `}</style>
      
      {/* Top Banner Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '3rem', height: '3rem', borderRadius: 'var(--radius-md)', background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <KeyRound size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Credentials Vault
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Store and manage all client logins, API keys and access details securely.
            </p>
          </div>
        </div>

        {/* Global Toolbar buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <Upload size={14} /> Import
          </button>
          <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <Plus size={16} /> Add Credential
          </button>
        </div>
      </div>

      {/* Quick Navigation Tabs (Airtable / Linear look) */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', gap: '0.375rem', overflow: 'visible' }}>
        {[
          { id: 'all', label: 'All', count: stats.total_credentials },
          { id: 'favorites', label: '★ Favorites', count: stats.favorite_credentials },
          { id: 'recently_used', label: 'Recently Used', count: stats.recently_used },
          { id: 'wordpress', label: 'WordPress' },
          { id: 'hosting', label: 'Hosting' },
          { id: 'domains', label: 'Domains' },
          { id: 'meta', label: 'Meta / Facebook' },
          { id: 'google', label: 'Google' },
          { id: 'stripe', label: 'Stripe' },
          { id: 'shopify', label: 'Shopify' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setPage(1); }}
            style={{
              padding: '0.5rem 0.875rem',
              fontSize: '0.8125rem',
              fontWeight: tab === t.id ? 600 : 500,
              borderRadius: 'var(--radius-sm)',
              background: tab === t.id ? 'var(--accent-subtle)' : 'transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              transition: 'var(--transition-fast)'
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span style={{ fontSize: '0.75rem', opacity: 0.6, background: tab === t.id ? 'var(--accent)' : 'var(--border)', color: tab === t.id ? '#fff' : 'var(--text-muted)', padding: '0.125rem 0.375rem', borderRadius: '10px' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}

        {/* 'More' dropdown tab for extra platforms */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMoreTabs(!showMoreTabs)}
            style={{
              padding: '0.5rem 0.875rem',
              fontSize: '0.8125rem',
              fontWeight: morePlatforms.includes(tab) ? 600 : 500,
              borderRadius: 'var(--radius-sm)',
              background: morePlatforms.includes(tab) ? 'var(--accent-subtle)' : 'transparent',
              color: morePlatforms.includes(tab) ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem'
            }}
          >
            More <ChevronDownIcon />
          </button>
          {showMoreTabs && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)', zIndex: 10, minWidth: '150px', padding: '0.25rem'
            }}>
              {['cloudflare', 'email', 'apis', 'other'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setTab(opt); setPage(1); setShowMoreTabs(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '0.5rem 0.75rem',
                    textAlign: 'left', fontSize: '0.8125rem', color: tab === opt ? 'var(--accent)' : 'var(--text-secondary)',
                    background: tab === opt ? 'var(--accent-subtle)' : 'transparent',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer'
                  }}
                >
                  {opt.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Spreadsheet filters toolbar */}
      <div style={{
        display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap',
        background: 'var(--surface)', padding: '0.5rem', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search credentials..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '0.375rem 0.75rem 0.375rem 2rem', fontSize: '0.8125rem',
              background: 'var(--background)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
            }}
          />
        </div>

        {/* Client dropdown filter */}
        <select
          value={clientFilter}
          onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
          style={{
            padding: '0.375rem 0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
          }}
        >
          <option value="">All Clients</option>
          {filters.clients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Platform dropdown filter */}
        <select
          value={platformFilter}
          onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}
          style={{
            padding: '0.375rem 0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
          }}
        >
          <option value="">All Platforms</option>
          {filters.platforms.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Type dropdown filter */}
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          style={{
            padding: '0.375rem 0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
          }}
        >
          <option value="">All Types</option>
          {filters.types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Column visibility controller */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColumnDropdown(!showColumnDropdown)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
          >
            <SlidersHorizontal size={14} /> Columns
          </button>
          {showColumnDropdown && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)', zIndex: 10, minWidth: '180px', padding: '0.5rem',
              display: 'flex', flexDirection: 'column', gap: '0.375rem'
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', padding: '0.25rem 0.5rem' }}>Show/Hide Columns</span>
              {Object.keys(visibleColumns).map((col) => (
                <label key={col} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={visibleColumns[col as keyof typeof visibleColumns]}
                    onChange={() => setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col as keyof typeof visibleColumns] }))}
                  />
                  {col.charAt(0).toUpperCase() + col.slice(1)}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Toggle show archived settings */}
        <button
          onClick={() => { setShowArchived(!showArchived); setPage(1); }}
          className={`btn ${showArchived ? 'btn-primary' : 'btn-secondary'}`}
          title="Show archived credentials"
          style={{ padding: '0.375rem 0.5rem' }}
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Spreadsheet Table Container */}
      <div style={{
        flex: 1, minHeight: '300px', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {isLoading ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
            <RefreshCw size={24} className="animate-spin text-accent" />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Loading credentials vault...</span>
          </div>
        ) : isError ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem', color: 'var(--danger)' }}>
            <AlertCircle size={28} />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Error loading credentials</span>
            <button onClick={() => refetch()} className="btn btn-secondary btn-sm">Retry</button>
          </div>
        ) : credentials.length === 0 ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
            <KeyRound size={32} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No credentials found matching filters.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowX: 'auto' }}>
            
            {/* Table Header Row */}
            <div style={{
              display: 'grid', gridTemplateColumns, borderBottom: '1px solid var(--border)',
              background: 'var(--surface-elevated)', fontWeight: 600, fontSize: '0.75rem',
              color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
              position: 'sticky', top: 0, zIndex: 5, userSelect: 'none'
            }}>
              {/* Select Column */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--surface-elevated)', zIndex: 6 }}>
                <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {selectedIds.length === credentials.length ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
                </button>
              </div>

              {/* Favorite Column */}
              {visibleColumns.favorite && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', borderRight: '1px solid var(--border)' }}>
                  <Star size={12} fill="var(--text-muted)" style={{ color: 'var(--text-muted)' }} />
                </div>
              )}

              {/* Client Name Column */}
              {visibleColumns.client && (
                <div
                  onClick={() => handleSort('client_name')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', cursor: 'pointer', position: 'relative' }}
                >
                  <span>Client {sortBy === 'client_name' && (sortDir === 'asc' ? '▲' : '▼')}</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('client', e)} className="resize-handle" />
                </div>
              )}

              {/* Website/Platform Column */}
              {visibleColumns.platform && (
                <div
                  onClick={() => handleSort('platform')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', cursor: 'pointer', position: 'relative' }}
                >
                  <span>Platform {sortBy === 'platform' && (sortDir === 'asc' ? '▲' : '▼')}</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('platform', e)} className="resize-handle" />
                </div>
              )}

              {/* Credential Type Column */}
              {visibleColumns.type && (
                <div
                  onClick={() => handleSort('credential_type')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', cursor: 'pointer', position: 'relative' }}
                >
                  <span>Type {sortBy === 'credential_type' && (sortDir === 'asc' ? '▲' : '▼')}</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('type', e)} className="resize-handle" />
                </div>
              )}

              {/* Username/Email Column */}
              {visibleColumns.username && (
                <div
                  onClick={() => handleSort('username')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', cursor: 'pointer', position: 'relative' }}
                >
                  <span>Username/Email {sortBy === 'username' && (sortDir === 'asc' ? '▲' : '▼')}</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('username', e)} className="resize-handle" />
                </div>
              )}

              {/* Password Column */}
              {visibleColumns.password && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', position: 'relative' }}>
                  <span>Password/Key</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('password', e)} className="resize-handle" />
                </div>
              )}

              {/* Login URL Column */}
              {visibleColumns.url && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', position: 'relative' }}>
                  <span>Login URL</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('url', e)} className="resize-handle" />
                </div>
              )}

              {/* Notes/Tags Column */}
              {visibleColumns.tags && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', position: 'relative' }}>
                  <span>Notes/Tags</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('tags', e)} className="resize-handle" />
                </div>
              )}

              {/* Last Updated Column */}
              {visibleColumns.updated && (
                <div
                  onClick={() => handleSort('updated_at')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', cursor: 'pointer', position: 'relative' }}
                >
                  <span>Last Updated {sortBy === 'updated_at' && (sortDir === 'asc' ? '▲' : '▼')}</span>
                  <div onMouseDown={(e) => onColumnResizeMouseDown('updated', e)} className="resize-handle" />
                </div>
              )}

              {/* Actions Column */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 0.75rem' }}>
                <span>Actions</span>
              </div>
            </div>

            {/* Table Body */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              {credentials.map((row, idx) => {
                const isSelected = selectedIds.includes(row.id);
                const isPwdVisible = visiblePasswords[row.id] || false;
                
                return (
                  <div
                    key={row.id}
                    className={`table-row ${idx % 2 === 1 ? 'bg-zebra' : ''} ${isSelected ? 'bg-selected' : ''}`}
                    style={{
                      display: 'grid', gridTemplateColumns, borderBottom: '1px solid var(--border)',
                      fontSize: '0.8125rem', color: 'var(--text-primary)', minHeight: '38px',
                      alignItems: 'center', transition: 'var(--transition-fast)'
                    }}
                  >
                    {/* Checkbox Select */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem',
                      borderRight: '1px solid var(--border)', position: 'sticky', left: 0,
                      background: isSelected ? 'var(--accent-subtle)' : (idx % 2 === 1 ? 'var(--background)' : 'var(--surface)'),
                      zIndex: 3
                    }}>
                      <button onClick={() => toggleSelectRow(row.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </div>

                    {/* Star Favorite */}
                    {visibleColumns.favorite && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', borderRight: '1px solid var(--border)' }}>
                        <button onClick={() => toggleFavorite(row.id, row.is_favorite)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: row.is_favorite ? '#f59e0b' : 'var(--text-muted)' }}>
                          <Star size={14} fill={row.is_favorite ? '#f59e0b' : 'none'} />
                        </button>
                      </div>
                    )}

                    {/* Client Name */}
                    {visibleColumns.client && (
                      <div
                        onDoubleClick={() => setEditingCell({ id: row.id, field: 'client_name', value: row.client_name })}
                        style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'cell', height: '100%', display: 'flex', alignItems: 'center' }}
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'client_name' ? (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleInlineEditSave}
                            onKeyDown={handleInlineEditKeyDown}
                            style={{ width: '100%', padding: '2px 4px', fontSize: '0.8125rem', background: 'var(--background)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{row.client_name}</span>
                        )}
                      </div>
                    )}

                    {/* Website/Platform */}
                    {visibleColumns.platform && (
                      <div
                        onDoubleClick={() => setEditingCell({ id: row.id, field: 'platform', value: row.platform })}
                        style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'cell', height: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'platform' ? (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleInlineEditSave}
                            onKeyDown={handleInlineEditKeyDown}
                            style={{ width: '100%', padding: '2px 4px', fontSize: '0.8125rem', background: 'var(--background)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                          />
                        ) : (
                          <>
                            <PlatformIcon platform={row.platform} />
                            <span>{row.platform}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Type Badge */}
                    {visibleColumns.type && (
                      <div style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '10px', fontWeight: 600,
                          background: getTypeBadgeColors(row.credential_type).bg,
                          color: getTypeBadgeColors(row.credential_type).text
                        }}>
                          {row.credential_type}
                        </span>
                      </div>
                    )}

                    {/* Username */}
                    {visibleColumns.username && (
                      <div
                        onDoubleClick={() => setEditingCell({ id: row.id, field: 'username', value: row.username })}
                        className="group"
                        style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'cell', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'username' ? (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleInlineEditSave}
                            onKeyDown={handleInlineEditKeyDown}
                            style={{ width: '100%', padding: '2px 4px', fontSize: '0.8125rem', background: 'var(--background)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                          />
                        ) : (
                          <>
                            <span className="font-mono text-xs">{row.username}</span>
                            <button
                              onClick={() => copyToClipboard(row.username, 'username', row.id)}
                              className="copy-btn opacity-0 group-hover:opacity-100"
                              title="Copy username"
                              style={{ background: 'none', border: 'none', padding: '0.125rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                              <Copy size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Password Masked */}
                    {visibleColumns.password && (
                      <div style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="font-mono text-xs">
                          {isPwdVisible ? row.password : '••••••••••••'}
                        </span>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            onClick={() => setVisiblePasswords({ ...visiblePasswords, [row.id]: !isPwdVisible })}
                            style={{ background: 'none', border: 'none', padding: '0.125rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            {isPwdVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(row.password || '', 'password', row.id)}
                            style={{ background: 'none', border: 'none', padding: '0.125rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Login URL */}
                    {visibleColumns.url && (
                      <div
                        onDoubleClick={() => setEditingCell({ id: row.id, field: 'login_url', value: row.login_url || '' })}
                        style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'cell', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'login_url' ? (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleInlineEditSave}
                            onKeyDown={handleInlineEditKeyDown}
                            style={{ width: '100%', padding: '2px 4px', fontSize: '0.8125rem', background: 'var(--background)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                          />
                        ) : (
                          <>
                            <span className="text-muted text-xs truncate max-w-[200px]">{row.login_url || '—'}</span>
                            {row.login_url && (
                              <a
                                href={row.login_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => logUsageMutation.mutate(row.id)}
                                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Notes / Tags */}
                    {visibleColumns.tags && (
                      <div
                        onDoubleClick={() => setEditingCell({ id: row.id, field: 'notes', value: row.notes || '' })}
                        style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'cell', height: '100%', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'notes' ? (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleInlineEditSave}
                            onKeyDown={handleInlineEditKeyDown}
                            style={{ width: '100%', padding: '2px 4px', fontSize: '0.8125rem', background: 'var(--background)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                          />
                        ) : (
                          <>
                            {row.tags ? (
                              row.tags.split(',').map((tag) => (
                                <span key={tag} style={{ fontSize: '0.7rem', padding: '0.05rem 0.375rem', borderRadius: '4px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} className="truncate">{row.notes || '—'}</span>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Last Updated */}
                    {visibleColumns.updated && (
                      <div style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-secondary)', height: '100%', display: 'flex', alignItems: 'center' }}>
                        <span>{new Date(row.updated_at).toLocaleDateString()} {new Date(row.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}

                    {/* Actions Menu */}
                    <div style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button onClick={() => duplicateMutation.mutate(row.id)} title="Duplicate" style={{ background: 'none', border: 'none', padding: '0.125rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <Copy size={13} />
                      </button>
                      <button onClick={() => archiveRow(row.id)} title="Archive" style={{ background: 'none', border: 'none', padding: '0.125rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <Archive size={13} />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(row.id)} title="Delete permanently" style={{ background: 'none', border: 'none', padding: '0.125rem', cursor: 'pointer', color: 'var(--danger)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Bulk Selection actions floating bar */}
        {selectedIds.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface-elevated)', border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '0.625rem 1.25rem',
            display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 10
          }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedIds.length} row(s) selected
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => bulkArchiveMutation.mutate(selectedIds)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}
              >
                <Archive size={12} /> Archive
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="btn btn-danger btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
            <button onClick={() => setSelectedIds([])} className="btn-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
              Cancel
            </button>
          </div>
        )}

        {/* Table Pagination Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1rem', borderTop: '1px solid var(--border)',
          background: 'var(--surface-elevated)', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8125rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Showing {meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1} to {Math.min(meta.current_page * meta.per_page, meta.total)} of {meta.total} entries
          </span>
          
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Rows per page dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginRight: '1rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Rows per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                style={{
                  padding: '0.25rem 0.5rem', background: 'var(--background)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                }}
              >
                <option value="15">15</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            {/* Prev Page */}
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)',
                color: page === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Page number indicators */}
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              Page {page} of {meta.last_page || 1}
            </span>

            {/* Next Page */}
            <button
              disabled={page >= meta.last_page}
              onClick={() => setPage(page + 1)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)',
                color: page >= meta.last_page ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page >= meta.last_page ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom carousels / widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginTop: '0.5rem' }}>
        
        {/* Recently Used Credentials carousel widget */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'
        }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <RefreshCw size={14} className="text-accent" /> Recently Used Logins
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {credentials.filter((c) => c.last_used_at).slice(0, 3).map((item) => (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', background: 'var(--surface-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PlatformIcon platform={item.platform} />
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{item.platform}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.client_name} • {item.username}</div>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(item.password || '', 'password', item.id)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0.25rem 0.5rem', display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem' }}
                >
                  <Copy size={10} /> Password
                </button>
              </div>
            ))}
            {credentials.filter((c) => c.last_used_at).length === 0 && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No credentials used recently.</span>
            )}
          </div>
        </div>

        {/* Favorite Credentials quick widget */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'
        }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Star size={14} fill="#f59e0b" style={{ color: '#f59e0b' }} /> Starred Credentials
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {credentials.filter((c) => c.is_favorite).slice(0, 3).map((item) => (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', background: 'var(--surface-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PlatformIcon platform={item.platform} />
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{item.platform}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.client_name} • {item.username}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => copyToClipboard(item.username, 'username', item.id)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.25rem' }}
                    title="Copy Username"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    onClick={() => copyToClipboard(item.password || '', 'password', item.id)}
                    className="btn btn-primary btn-sm"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                  >
                    Copy Pass
                  </button>
                </div>
              </div>
            ))}
            {credentials.filter((c) => c.is_favorite).length === 0 && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No starred credentials.</span>
            )}
          </div>
        </div>

      </div>

      {/* --- Add Credential Modal --- */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '500px',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Add New Credential</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Close</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(credentialForm); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Client Selection (Combobox or manual text) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Client Name</label>
                <input
                  type="text"
                  required
                  placeholder="Enter client company name (e.g. Globotech)"
                  value={credentialForm.client_name}
                  onChange={(e) => setCredentialForm({ ...credentialForm, client_name: e.target.value })}
                  list="client-suggestions"
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                />
                <datalist id="client-suggestions">
                  {systemClients.map((sc) => (
                    <option key={sc.client_id} value={sc.company_name || sc.client_name} />
                  ))}
                </datalist>
              </div>

              {/* Platform / Website */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Platform / Website</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WordPress Admin, Cloudflare"
                  value={credentialForm.platform}
                  onChange={(e) => setCredentialForm({ ...credentialForm, platform: e.target.value })}
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Credential Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Credential Type</label>
                <select
                  value={credentialForm.credential_type}
                  onChange={(e) => setCredentialForm({ ...credentialForm, credential_type: e.target.value })}
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                >
                  <option value="Website">Website</option>
                  <option value="Hosting">Hosting</option>
                  <option value="Domain">Domain</option>
                  <option value="Payment">Payment</option>
                  <option value="API Key">API Key</option>
                  <option value="FTP">FTP</option>
                  <option value="SSH">SSH</option>
                  <option value="Server">Server</option>
                  <option value="Advertising">Advertising</option>
                  <option value="Social Media">Social Media</option>
                  <option value="Analytics">Analytics</option>
                  <option value="Email">Email</option>
                  <option value="Security">Security</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Username / Email</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. admin@globotech.com"
                  value={credentialForm.username}
                  onChange={(e) => setCredentialForm({ ...credentialForm, username: e.target.value })}
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Password / Secret Key</label>
                <input
                  type="password"
                  required
                  placeholder="Enter login password"
                  value={credentialForm.password}
                  onChange={(e) => setCredentialForm({ ...credentialForm, password: e.target.value })}
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Login URL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Login URL / Port (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. https://www.globotech.com/wp-admin"
                  value={credentialForm.login_url}
                  onChange={(e) => setCredentialForm({ ...credentialForm, login_url: e.target.value })}
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Tags/Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Production,Main Server"
                  value={credentialForm.tags}
                  onChange={(e) => setCredentialForm({ ...credentialForm, tags: e.target.value })}
                  style={{
                    padding: '0.5rem', fontSize: '0.8125rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Starred Favorite */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={credentialForm.is_favorite}
                  onChange={(e) => setCredentialForm({ ...credentialForm, is_favorite: e.target.checked })}
                />
                Mark as Favorite Star ⭐
              </label>

              <button type="submit" disabled={createMutation.isPending} className="btn btn-primary" style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                {createMutation.isPending ? 'Saving...' : 'Create Credential'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- Import Modal --- */}
      {showImportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '600px',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Import Credentials JSON</h2>
              <button onClick={() => { setShowImportModal(false); setImportText(''); setImportError(''); }} className="btn-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Close</button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Paste a valid JSON array of credential objects. Required properties per object: 
              <code>client_name</code>, <code>platform</code>, <code>credential_type</code>, <code>username</code>, <code>password</code>.
            </p>
            
            <textarea
              rows={8}
              placeholder='[
  {
    "client_name": "New Client Ltd",
    "platform": "cPanel",
    "credential_type": "Hosting",
    "username": "client_user",
    "password": "securepassword",
    "login_url": "https://cpanel.domain.com",
    "tags": "Main Server"
  }
]'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{
                width: '100%', padding: '0.5rem', fontSize: '0.75rem', fontFamily: 'monospace',
                background: 'var(--background)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', resize: 'vertical'
              }}
            />

            {importError && (
              <div style={{ color: 'var(--danger)', fontSize: '0.75rem', background: 'var(--danger-subtle)', padding: '0.5rem', borderRadius: '4px' }}>
                {importError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowImportModal(false); setImportText(''); setImportError(''); }} className="btn btn-secondary">Cancel</button>
              <button onClick={handleImportSubmit} className="btn btn-primary">Parse & Import</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Single Row Delete Confirmation Modal --- */}
      {showDeleteConfirm !== null && (
        <ConfirmModal
          title="Delete Credential?"
          message="Are you sure you want to permanently delete this credential? This action is irreversible."
          danger={true}
          onConfirm={() => deleteMutation.mutate(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}

      {/* --- Bulk Delete Confirmation Modal --- */}
      {showBulkDeleteConfirm && (
        <ConfirmModal
          title="Delete Selected Credentials?"
          message={`Are you sure you want to permanently delete the ${selectedIds.length} selected credential(s)? This action is irreversible.`}
          danger={true}
          onConfirm={() => bulkDeleteMutation.mutate(selectedIds)}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

    </div>
  );
}

// Helper icons
function ChevronDownIcon() {
  return (
    <svg className="w-3 h-3 ml-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Subtle badge colors based on credential types
function getTypeBadgeColors(type: string) {
  const t = type.toLowerCase();
  
  if (t.includes('website')) {
    return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' }; // blue
  }
  if (t.includes('hosting')) {
    return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' }; // green
  }
  if (t.includes('domain')) {
    return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' }; // orange
  }
  if (t.includes('payment')) {
    return { bg: 'rgba(124, 58, 237, 0.15)', text: '#7c3aed' }; // purple
  }
  if (t.includes('api')) {
    return { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899' }; // pink
  }
  if (t.includes('ftp') || t.includes('ssh') || t.includes('server')) {
    return { bg: 'rgba(107, 114, 128, 0.15)', text: '#6b7280' }; // grey
  }
  if (t.includes('social') || t.includes('media') || t.includes('advertising')) {
    return { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9' }; // sky
  }
  if (t.includes('analytics')) {
    return { bg: 'rgba(220, 38, 38, 0.15)', text: '#dc2626' }; // red
  }
  
  return { bg: 'rgba(107, 114, 128, 0.1)', text: 'var(--text-secondary)' };
}
