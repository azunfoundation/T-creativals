'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sliders, Save, Loader2, AlertCircle, HelpCircle, Eye } from 'lucide-react';
import { platformSettings as settingsApi, SystemSettings, NumberSequence, getApiErrorMessage } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

export default function NumberSequencesPage() {
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sequences, setSequences] = useState<NumberSequence[]>([]);

  // Fetch Settings
  const { data: settings, isLoading, isError } = useQuery<SystemSettings>({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data;
    },
  });

  // Sync state
  useEffect(() => {
    if (settings && settings.number_sequences) {
      // Create copies so we can edit local states
      setSequences(JSON.parse(JSON.stringify(settings.number_sequences)));
    }
  }, [settings]);

  // Mutation
  const updateSequencesMutation = useMutation({
    mutationFn: (data: NumberSequence[]) => settingsApi.updateNumberSequences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      triggerAlert('All number sequences updated successfully.');
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Failed to update sequences.'));
    }
  });

  const triggerAlert = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const handleFieldChange = (index: number, field: keyof NumberSequence, value: any) => {
    setSequences(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSequencesMutation.mutate(sequences);
  };

  // Live preview logic
  const getPreview = (seq: NumberSequence) => {
    const year = new Date().getFullYear().toString();
    const nextNumber = seq.current_number + 1;
    const paddedNum = nextNumber.toString().padStart(seq.padding_length, '0');
    return seq.format
      .replace('{PREFIX}', seq.prefix || '')
      .replace('{YEAR}', year)
      .replace('{NUMBER}', paddedNum);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Loading sequence patterns...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sliders size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Number Sequences</h1>
          <HelpIcon
            title="Number Sequences"
            content={{
              what: 'The prefix, padding, and format used to auto-generate reference codes (like LEAD-2026-0001) for leads, quotes, invoices, projects, tasks, expenses, payroll runs, and payments.',
              why: 'Every one of these records gets its number from here automatically — nobody needs to type one in.',
            }}
          />
        </div>
        <HowToUseGuide
          moduleKey="settings_sequences"
          title="How Number Sequences Work"
          content={{
            overview: 'Each row controls how the next auto-generated code looks for one type of record. The system uses these settings every time a matching record is created — changes apply to future records only.',
            sections: [
              {
                heading: 'Fields',
                items: [
                  '"Next Number" is the last number used — the next record will be one higher than this.',
                  'Padding controls how many digits the number is padded to, e.g. 4 digits shows as 0001.',
                  'Format supports the placeholders {PREFIX}, {YEAR}, and {NUMBER} in any order.',
                ],
              },
              {
                heading: 'Best practice',
                items: [
                  'Raising "Next Number" skips codes forward — it never reuses or renumbers existing records.',
                  'Only founders and directors can change these.',
                ],
              },
            ],
          }}
        />
      </div>

      {isError && (
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
        }}>
          <AlertCircle size={16} />
          <span>Couldn't load number sequences. Please refresh and try again.</span>
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <div style={{
          padding: '0.875rem 1.25rem',
          background: 'var(--success-subtle)',
          color: 'var(--success)',
          border: '1px solid var(--success)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          {successMsg}
        </div>
      )}

      {errorMsg && (
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
        }}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sliders size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Number Sequences Management</h2>
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Configure unique prefix tags, numbering pads, and formatting structures for system modules.
          Use <code style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-elevated)', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '0.75rem', border: '1px solid var(--border)' }}>&#123;PREFIX&#125;</code>, <code style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-elevated)', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '0.75rem', border: '1px solid var(--border)' }}>&#123;YEAR&#125;</code>, and <code style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-elevated)', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '0.75rem', border: '1px solid var(--border)' }}>&#123;NUMBER&#125;</code> in format keys.
        </p>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textTransform: 'capitalize' }}>Module Entity</th>
                <th>Prefix</th>
                <th>Next Number</th>
                <th>Padding Length</th>
                <th>Format Pattern</th>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Eye size={12} /> Next Auto-Generated Code
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq, idx) => (
                <tr key={seq.id}>
                  {/* Entity Type Label */}
                  <td style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                    {seq.entity_type}
                  </td>

                  {/* Prefix */}
                  <td>
                    <input
                      required
                      type="text"
                      value={seq.prefix}
                      onChange={(e) => handleFieldChange(idx, 'prefix', e.target.value.toUpperCase())}
                      className="form-input"
                      style={{ width: '80px', fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                  </td>

                  {/* Current Number */}
                  <td>
                    <input
                      required
                      type="number"
                      min="0"
                      value={seq.current_number}
                      onChange={(e) => handleFieldChange(idx, 'current_number', parseInt(e.target.value, 10) || 0)}
                      className="form-input"
                      style={{ width: '100px' }}
                      title="Next generated number will be this value + 1"
                    />
                  </td>

                  {/* Padding Length */}
                  <td>
                    <select
                      value={seq.padding_length}
                      onChange={(e) => handleFieldChange(idx, 'padding_length', parseInt(e.target.value, 10))}
                      className="form-input"
                      style={{ width: '80px' }}
                    >
                      <option value={3}>3 digits (001)</option>
                      <option value={4}>4 digits (0001)</option>
                      <option value={5}>5 digits (00001)</option>
                      <option value={6}>6 digits (000001)</option>
                    </select>
                  </td>

                  {/* Format Pattern */}
                  <td>
                    <input
                      required
                      type="text"
                      value={seq.format}
                      onChange={(e) => handleFieldChange(idx, 'format', e.target.value)}
                      className="form-input"
                      style={{ width: '220px', fontFamily: 'monospace' }}
                    />
                  </td>

                  {/* Realtime Generated Code Preview */}
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'var(--accent-subtle)',
                      border: '1px solid var(--accent)',
                      color: 'var(--accent)',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.8125rem'
                    }}>
                      {getPreview(seq)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button
            type="submit"
            disabled={updateSequencesMutation.isPending}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {updateSequencesMutation.isPending ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Save size={14} />
            )}
            <span>Save Number Sequences</span>
          </button>
        </div>

      </form>

    </div>
  );
}
