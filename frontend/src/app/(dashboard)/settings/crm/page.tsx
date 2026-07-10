'use client';

import { useState } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, ArrowUp, ArrowDown, Settings,
  Flag, Globe, Mail, Users, Share2, HelpCircle,
  FolderLock, Lock, Palette, AlertCircle
} from 'lucide-react';
import {
  leadStages as stagesApi,
  leadSources as sourcesApi,
  LeadStage, LeadSource, getApiErrorMessage
} from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

// ============================================================
// Icon Mapping
// ============================================================

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'globe': Globe,
  'mail': Mail,
  'user-plus': Users,
  'linkedin': LinkedinIcon,
  'share-2': Share2,
  'help-circle': HelpCircle,
};

const COLOR_PRESETS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber/Orange
  '#ef4444', // Red
  '#7c3aed', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Indigo
];

export default function CRMSettingsPage() {
  const { confirm, prompt } = useModal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Forms state
  const [editingStage, setEditingStage] = useState<LeadStage | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageSlug, setStageSlug] = useState('');
  const [stageColor, setStageColor] = useState('#3b82f6');
  const [stageOrder, setStageOrder] = useState('1');

  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceSlug, setSourceSlug] = useState('');
  const [sourceColor, setSourceColor] = useState('#3b82f6');
  const [sourceIcon, setSourceIcon] = useState('globe');

  // ============================================================
  // Queries
  // ============================================================

  const { data: stages = [], isLoading: loadingStages, isError: stagesError } = useQuery<LeadStage[]>({
    queryKey: ['leadStages'],
    queryFn: async () => {
      const res = await stagesApi.list();
      return res.data;
    }
  });

  const { data: sources = [], isLoading: loadingSources, isError: sourcesError } = useQuery<LeadSource[]>({
    queryKey: ['leadSources'],
    queryFn: async () => {
      const res = await sourcesApi.list();
      return res.data;
    }
  });

  // ============================================================
  // Stage Mutations
  // ============================================================

  const createStageMutation = useMutation({
    mutationFn: (data: any) => stagesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadStages'] });
      resetStageForm();
      showToast('Stage saved successfully.', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to save stage.'), 'error'),
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => stagesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadStages'] });
      resetStageForm();
      showToast('Stage updated successfully.', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to update stage.'), 'error'),
  });

  const deleteStageMutation = useMutation({
    mutationFn: (id: number) => stagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadStages'] });
      showToast('Stage deleted successfully.', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to delete stage.'), 'error'),
  });

  // ============================================================
  // Source Mutations
  // ============================================================

  const createSourceMutation = useMutation({
    mutationFn: (data: any) => sourcesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadSources'] });
      resetSourceForm();
      showToast('Acquisition channel saved successfully.', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to save acquisition channel.'), 'error'),
  });

  const updateSourceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => sourcesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadSources'] });
      resetSourceForm();
      showToast('Acquisition channel updated successfully.', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to update acquisition channel.'), 'error'),
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (id: number) => sourcesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadSources'] });
      showToast('Acquisition channel deleted successfully.', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to delete acquisition channel.'), 'error'),
  });

  // ============================================================
  // Stage Form Actions
  // ============================================================

  const handleStageNameChange = (name: string) => {
    setStageName(name);
    if (!editingStage) {
      setStageSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''));
    }
  };

  const handleStageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageName.trim()) return;

    const postData = {
      name: stageName,
      slug: stageSlug || stageName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      color: stageColor,
      sort_order: parseInt(stageOrder, 10) || 1
    };

    if (editingStage) {
      updateStageMutation.mutate({ id: editingStage.id, data: postData });
    } else {
      createStageMutation.mutate(postData);
    }
  };

  const startEditStage = (stage: LeadStage) => {
    setEditingStage(stage);
    setStageName(stage.name);
    setStageSlug(stage.slug);
    setStageColor(stage.color);
    setStageOrder(stage.sort_order.toString());
  };

  const resetStageForm = () => {
    setEditingStage(null);
    setStageName('');
    setStageSlug('');
    setStageColor('#3b82f6');
    setStageOrder((stages.length + 1).toString());
  };

  const handleMoveStage = (stage: LeadStage, direction: 'up' | 'down') => {
    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((s) => s.id === stage.id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Swap sort orders
    const targetStage = sorted[targetIndex];
    const originalOrder = stage.sort_order;
    const targetOrder = targetStage.sort_order;

    // Trigger updates
    updateStageMutation.mutate({ id: stage.id, data: { sort_order: targetOrder } });
    updateStageMutation.mutate({ id: targetStage.id, data: { sort_order: originalOrder } });
  };

  // ============================================================
  // Source Form Actions
  // ============================================================

  const handleSourceNameChange = (name: string) => {
    setSourceName(name);
    if (!editingSource) {
      setSourceSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''));
    }
  };

  const handleSourceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim()) return;

    const postData = {
      name: sourceName,
      slug: sourceSlug || sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      color: sourceColor,
      icon: sourceIcon
    };

    if (editingSource) {
      updateSourceMutation.mutate({ id: editingSource.id, data: postData });
    } else {
      createSourceMutation.mutate(postData);
    }
  };

  const startEditSource = (src: LeadSource) => {
    setEditingSource(src);
    setSourceName(src.name);
    setSourceSlug(src.slug);
    setSourceColor(src.color);
    setSourceIcon(src.icon || 'globe');
  };

  const resetSourceForm = () => {
    setEditingSource(null);
    setSourceName('');
    setSourceSlug('');
    setSourceColor('#3b82f6');
    setSourceIcon('globe');
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)'
          }}>
            <Settings size={16} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Settings
              <HelpIcon
                title="CRM Pipelines & Sources"
                content={{
                  what: 'The stages leads move through (New → Contacted → Won, etc.) and the acquisition channels used to tag where a lead came from.',
                  why: 'These power the CRM pipeline board and lead-source reporting — changes here apply platform-wide, immediately.',
                }}
              />
            </span>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1px' }}>
              CRM Pipelines & Sources
            </h1>
          </div>
        </div>
        <HowToUseGuide
          moduleKey="settings_crm"
          title="How to Use CRM Pipelines & Sources"
          content={{
            overview: 'Deal Stages define the sales pipeline every lead moves through; Acquisition Channels track how a lead found you.',
            sections: [
              {
                heading: 'Deal Stages',
                items: [
                  'System stages (locked) can be renamed and recolored but never deleted — they\'re relied on elsewhere in the app.',
                  'Use the up/down arrows to reorder stages in the pipeline.',
                ],
              },
              {
                heading: 'Acquisition Channels',
                items: ['Deleting a channel does not delete leads already tagged with it.'],
              },
            ],
          }}
        />
      </div>

      {(stagesError || sourcesError) && (
        <div style={{
          padding: '0.875rem 1.25rem',
          background: 'var(--danger-subtle)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
        }}>
          <AlertCircle size={16} />
          <span>Couldn't load pipeline configuration. Please refresh and try again.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 560px), 1fr))', gap: '2rem' }}>
        
        {/* ============================================================
            COLUMN 1: LEAD STAGES CONFIG
            ============================================================ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* List Card */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Deal Stages List
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Stages are chronological blocks that form your sales pipeline. System stages cannot be deleted.
            </p>

            <div className="data-table-wrap">
              {loadingStages ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading stages...</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Order</th>
                      <th>Stage Name</th>
                      <th>Slug</th>
                      <th>Color</th>
                      <th>System</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stages].sort((a,b) => a.sort_order - b.sort_order).map((stage, idx, arr) => (
                      <tr key={stage.id}>
                        {/* Drag Sort Controls */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              disabled={idx === 0}
                              onClick={() => handleMoveStage(stage, 'up')}
                              style={{ padding: '2px', color: idx === 0 ? 'var(--border)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              disabled={idx === arr.length - 1}
                              onClick={() => handleMoveStage(stage, 'down')}
                              style={{ padding: '2px', color: idx === arr.length - 1 ? 'var(--border)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: idx === arr.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              <ArrowDown size={11} />
                            </button>
                          </div>
                        </td>
                        
                        {/* Name */}
                        <td style={{ fontWeight: 600 }}>{stage.name}</td>
                        
                        {/* Slug */}
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {stage.slug}
                        </td>
                        
                        {/* Color */}
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
                            <span style={{ width: 12, height: 12, borderRadius: '3px', background: stage.color, border: '1px solid var(--border)' }} />
                            {stage.color}
                          </span>
                        </td>

                        {/* System Stage Flag */}
                        <td>
                          {stage.is_system ? (
                            <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }} title="System Stage (Locked)">
                              <Lock size={11} /> Locked
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>Custom</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button 
                              onClick={() => startEditStage(stage)}
                              className="btn btn-ghost btn-sm btn-icon" 
                              title="Edit Stage"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              disabled={stage.is_system}
                              onClick={async () => {
                                if (await confirm({ message: `Delete custom stage "${stage.name}"?`, variant: 'danger' })) {
                                  deleteStageMutation.mutate(stage.id);
                                }
                              }}
                              className="btn btn-danger btn-sm btn-icon"
                              style={{ opacity: stage.is_system ? 0.3 : 1 }}
                              title={stage.is_system ? 'System stages cannot be deleted' : 'Delete Stage'}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Form Card */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              {editingStage ? `Edit Stage: ${editingStage.name}` : 'Add Custom Stage'}
            </h2>
            
            <form onSubmit={handleStageSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div className="form-group">
                <label className="form-label">Stage Display Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Initial Call Scheduled"
                  value={stageName}
                  onChange={(e) => handleStageNameChange(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unique Slug Identifier *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. initial_call"
                  value={stageSlug}
                  onChange={(e) => setStageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="form-input"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Pipeline Sort Order *</label>
                <input
                  required
                  type="number"
                  placeholder="e.g. 7"
                  value={stageOrder}
                  onChange={(e) => setStageOrder(e.target.value)}
                  className="form-input"
                />
              </div>

              {/* Color Presets */}
              <div className="form-group">
                <label className="form-label">Stage Color Theme</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setStageColor(color)}
                      style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: color,
                        border: stageColor === color ? '2px solid #fff' : '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  ))}
                  
                  {/* Hex Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '0.5rem' }}>
                    <Palette size={14} style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="color"
                      value={stageColor}
                      onChange={(e) => setStageColor(e.target.value)}
                      style={{ border: 'none', background: 'none', width: '24px', height: '24px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="form-input"
                  style={{ height: '34px', fontSize: '0.8125rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                {editingStage && (
                  <button type="button" onClick={resetStageForm} className="btn btn-secondary">
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={createStageMutation.isPending || updateStageMutation.isPending}
                  className="btn btn-primary"
                >
                  {editingStage ? 'Update Stage' : 'Save Stage'}
                </button>
              </div>

            </form>
          </div>

        </div>

        {/* ============================================================
            COLUMN 2: LEAD SOURCES CONFIG
            ============================================================ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* List Card */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Acquisition Channels (Sources)
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Sources identify how a lead found your business, which helps analyze marketing ROI.
            </p>

            <div className="data-table-wrap">
              {loadingSources ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading channels...</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Icon</th>
                      <th>Source Name</th>
                      <th>Slug</th>
                      <th>Color</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((src) => {
                      const IconComponent = ICON_MAP[src.icon || 'help-circle'] || HelpCircle;
                      return (
                        <tr key={src.id}>
                          {/* Visual Icon */}
                          <td>
                            <div style={{
                              width: 28, height: 28, borderRadius: '6px',
                              background: 'var(--surface-elevated)', border: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: src.color
                            }}>
                              <IconComponent size={14} />
                            </div>
                          </td>

                          {/* Name */}
                          <td style={{ fontWeight: 600 }}>{src.name}</td>
                          
                          {/* Slug */}
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {src.slug}
                          </td>
                          
                          {/* Color */}
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
                              <span style={{ width: 12, height: 12, borderRadius: '3px', background: src.color, border: '1px solid var(--border)' }} />
                              {src.color}
                            </span>
                          </td>

                          {/* Actions */}
                          <td>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={() => startEditSource(src)}
                                className="btn btn-ghost btn-sm btn-icon" 
                                title="Edit Source"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={async () => {
                                  if (await confirm({ message: `Delete acquisition channel "${src.name}"?`, variant: 'danger' })) {
                                    deleteSourceMutation.mutate(src.id);
                                  }
                                }}
                                className="btn btn-danger btn-sm btn-icon"
                                title="Delete Source"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Form Card */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              {editingSource ? `Edit Channel: ${editingSource.name}` : 'Add Acquisition Channel'}
            </h2>
            
            <form onSubmit={handleSourceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div className="form-group">
                <label className="form-label">Channel Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Dribbble Portfolio"
                  value={sourceName}
                  onChange={(e) => handleSourceNameChange(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unique Slug Identifier *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. dribbble"
                  value={sourceSlug}
                  onChange={(e) => setSourceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="form-input"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>

              {/* Icon selector */}
              <div className="form-group">
                <label className="form-label">Visual Icon *</label>
                <select
                  value={sourceIcon}
                  onChange={(e) => setSourceIcon(e.target.value)}
                  className="form-input font-medium"
                  style={{ textTransform: 'capitalize' }}
                >
                  <option value="globe">Globe/Website</option>
                  <option value="mail">Mail/Newsletter</option>
                  <option value="user-plus">Referrals/Network</option>
                  <option value="linkedin">LinkedIn Profile</option>
                  <option value="share-2">Social Channels</option>
                  <option value="help-circle">General/Other</option>
                </select>
              </div>

              {/* Color Presets */}
              <div className="form-group">
                <label className="form-label">Channel Color Code</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSourceColor(color)}
                      style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: color,
                        border: sourceColor === color ? '2px solid #fff' : '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  ))}
                  
                  {/* Hex Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '0.5rem' }}>
                    <Palette size={14} style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="color"
                      value={sourceColor}
                      onChange={(e) => setSourceColor(e.target.value)}
                      style={{ border: 'none', background: 'none', width: '24px', height: '24px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={sourceColor}
                  onChange={(e) => setSourceColor(e.target.value)}
                  className="form-input"
                  style={{ height: '34px', fontSize: '0.8125rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                {editingSource && (
                  <button type="button" onClick={resetSourceForm} className="btn btn-secondary">
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={createSourceMutation.isPending || updateSourceMutation.isPending}
                  className="btn btn-primary"
                >
                  {editingSource ? 'Update Channel' : 'Save Channel'}
                </button>
              </div>

            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
