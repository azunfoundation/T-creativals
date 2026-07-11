'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Layers, Plus, AlertCircle } from 'lucide-react';
import { taskTemplatesApi, getApiErrorMessage, TaskTemplate } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { HelpIcon } from '@/components/ui/HelpIcon';

/**
 * Apply a saved task template to a project (PRD: a Website project
 * auto-creating its standard task list), with inline template creation and
 * an option to make the template a recurring project's monthly recipe.
 */
export default function ApplyTemplateModal({
  projectId,
  isRecurringProject,
  onClose,
  onApplied,
}: {
  projectId: number;
  isRecurringProject: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [setAsRecurring, setSetAsRecurring] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLines, setNewLines] = useState('');

  const { data: templates = [], isLoading, isError } = useQuery<TaskTemplate[]>({
    queryKey: ['task-templates'],
    queryFn: async () => {
      const res = await taskTemplatesApi.list();
      return (res.data as unknown as TaskTemplate[]) || [];
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => taskTemplatesApi.applyToProject(projectId, Number(selectedId), setAsRecurring),
    onSuccess: (res) => {
      showToast((res.data as any)?.message || 'Template applied — tasks created.', 'success');
      onApplied();
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to apply the template.'), 'error'),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const items = newLines
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(title => ({ title }));
      return taskTemplatesApi.create({ name: newName, items });
    },
    onSuccess: (res) => {
      showToast('Template saved — now pick it below and apply.', 'success');
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
      setSelectedId((res.data as any)?.data?.id ?? '');
      setCreating(false);
      setNewName('');
      setNewLines('');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to save the template.'), 'error'),
  });

  const selected = templates.find(t => t.id === selectedId);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            <Layers className="text-accent" size={18} /> Apply Task Template
            <HelpIcon text="Creates this project's standard task list in one click — e.g. a Website template adding Domain Setup, Hosting, UI Design, Development, Testing, and Launch. For monthly retainers, tick the recurring option so the tasks re-create automatically on the 1st of each month." size={13} />
          </h3>
          <button onClick={onClose} className="btn btn-icon"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: '0.8125rem' }}>
              <AlertCircle size={14} /> Couldn't load templates — close and reopen to retry.
            </div>
          )}

          {isLoading ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Loading templates…</p>
          ) : templates.length === 0 && !creating ? (
            <div style={{ padding: '1.25rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              No task templates yet. Create your first one — e.g. "Website Project" with its standard steps.
            </div>
          ) : !creating && (
            <>
              <div className="form-group">
                <label className="form-label">Template</label>
                <select className="form-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select a template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.items?.length ?? t.items_count ?? 0} tasks)</option>
                  ))}
                </select>
              </div>

              {selected && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>Tasks this will create:</div>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(selected.items || []).map(i => <li key={i.id}>{i.title}</li>)}
                  </ol>
                </div>
              )}

              {isRecurringProject && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={setAsRecurring} onChange={(e) => setSetAsRecurring(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>
                    Re-create these tasks automatically every month
                    <HelpIcon text="This project is a retainer (recurring). Ticking this links the template so the scheduler re-creates its tasks on the 1st of every month while the project is running." size={11} />
                  </span>
                </label>
              )}
            </>
          )}

          {creating ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Template Name *</label>
                <input type="text" className="form-input" placeholder="e.g. Website Project" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Tasks (one per line) *
                  <HelpIcon text="Each line becomes one task, in order. Example: Domain Setup, Hosting Setup, UI Design, Development, Testing, Launch." size={11} />
                </label>
                <textarea className="form-input" style={{ minHeight: 120, resize: 'vertical' }}
                  placeholder={'Domain Setup\nHosting Setup\nUI Design\nDevelopment\nTesting\nLaunch'}
                  value={newLines} onChange={(e) => setNewLines(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Back</button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={createMutation.isPending || !newName.trim() || !newLines.trim()}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}>
              <Plus size={13} /> New template
            </button>
          )}
        </div>
        {!creating && (
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedId || applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? 'Applying…' : 'Create Tasks'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
