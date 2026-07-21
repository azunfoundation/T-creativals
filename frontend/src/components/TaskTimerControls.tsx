'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, CheckCircle2, RotateCcw, Clock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasks as tasksApi, Task } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface TaskTimerControlsProps {
  task: Task;
  compact?: boolean;
  onUpdate?: () => void;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function TaskTimerControls({ task, compact = false, onUpdate }: TaskTimerControlsProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [elapsed, setElapsed] = useState<number>(0);

  const isRunning = Boolean(task.timer_started_at);
  const accumulated = task.timer_accumulated_seconds || 0;

  // Live timer tick
  useEffect(() => {
    if (!task.timer_started_at) {
      setElapsed(accumulated);
      return;
    }

    const startTime = new Date(task.timer_started_at).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const currentRunSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsed(accumulated + currentRunSeconds);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [task.timer_started_at, accumulated]);

  // Start / Resume mutation
  const startMutation = useMutation({
    mutationFn: () => tasksApi.startTimer(task.id),
    onSuccess: () => {
      showToast('Timer started', 'success');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (onUpdate) onUpdate();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to start timer', 'error');
    },
  });

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: () => tasksApi.pauseTimer(task.id),
    onSuccess: () => {
      showToast('Timer paused', 'info');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (onUpdate) onUpdate();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to pause timer', 'error');
    },
  });

  // Complete mutation
  const completeMutation = useMutation({
    mutationFn: () => tasksApi.completeTimer(task.id),
    onSuccess: (res: any) => {
      showToast('Task completed! Timesheet logged & project progress updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project_profitability'] });
      if (onUpdate) onUpdate();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to complete task', 'error');
    },
  });

  const isCompleted = task.status === 'done';

  if (isCompleted) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: compact ? '0.6875rem' : '0.75rem',
          fontWeight: 600,
          color: 'var(--success, #10b981)',
        }}
      >
        <CheckCircle2 size={compact ? 12 : 14} />
        <span>Completed</span>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '0.35rem' : '0.5rem',
        flexWrap: 'wrap',
      }}
    >
      {/* Running/Paused Live Display */}
      {elapsed > 0 && (
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: compact ? '0.6875rem' : '0.75rem',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: isRunning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: isRunning ? '#10b981' : '#f59e0b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <Clock size={compact ? 11 : 12} />
          {formatDuration(elapsed)}
        </span>
      )}

      {/* Start / Pause / Resume Controls */}
      {isRunning ? (
        <button
          type="button"
          onClick={() => pauseMutation.mutate()}
          disabled={pauseMutation.isPending}
          className="btn btn-xs"
          style={{
            padding: compact ? '2px 6px' : '4px 8px',
            fontSize: compact ? '0.6875rem' : '0.75rem',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            cursor: 'pointer',
          }}
          title="Pause Timer"
        >
          <Pause size={compact ? 11 : 12} />
          <span>Pause</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending}
          className="btn btn-xs"
          style={{
            padding: compact ? '2px 6px' : '4px 8px',
            fontSize: compact ? '0.6875rem' : '0.75rem',
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#3b82f6',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            cursor: 'pointer',
          }}
          title={elapsed > 0 ? 'Resume Timer' : 'Start Timer'}
        >
          <Play size={compact ? 11 : 12} />
          <span>{elapsed > 0 ? 'Resume' : 'Start'}</span>
        </button>
      )}

      {/* One-Click Complete Control */}
      <button
        type="button"
        onClick={() => completeMutation.mutate()}
        disabled={completeMutation.isPending}
        className="btn btn-xs"
        style={{
          padding: compact ? '2px 6px' : '4px 8px',
          fontSize: compact ? '0.6875rem' : '0.75rem',
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          cursor: 'pointer',
        }}
        title="Stop timer & complete task"
      >
        <CheckCircle2 size={compact ? 11 : 12} />
        <span>Complete</span>
      </button>
    </div>
  );
}
