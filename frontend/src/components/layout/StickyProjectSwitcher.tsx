'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useQuery } from '@tanstack/react-query';
import { projects as projectsApi, Project } from '@/lib/api';
import { FolderKanban, ChevronDown, Check, X } from 'lucide-react';

export function StickyProjectSwitcher() {
  const { activeProjectId, setActiveProjectId } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: projectsData } = useQuery({
    queryKey: ['sticky_projects_list'],
    queryFn: async () => {
      const res = await projectsApi.list({ per_page: 100 });
      // Normalize response array
      const raw = res.data;
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray((raw as any).data)) return (raw as any).data as Project[];
      return [];
    },
    staleTime: 60_000,
  });

  const projectList: Project[] = Array.isArray(projectsData) ? projectsData : [];
  const activeProject = projectList.find((p) => Number(p.id) === Number(activeProjectId));

  return (
    <div ref={dropdownRef} className="relative inline-block text-left" style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="topbar-project-switcher-btn"
        title="Active Project Context — pre-selects project in tasks, timesheets, expenses, invoices, & documents"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.65rem',
          borderRadius: '0.5rem',
          background: activeProject ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card)',
          border: activeProject ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border)',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: activeProject ? 'var(--primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.15s ease-in-out',
        }}
      >
        <FolderKanban size={14} style={{ color: activeProject ? '#3b82f6' : 'var(--text-muted)' }} />
        <span className="truncate max-w-[140px]" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeProject ? activeProject.name : 'All Projects'}
        </span>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      {isOpen && (
        <div
          className="topbar-project-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.375rem)',
            right: 0,
            width: '240px',
            maxHeight: '320px',
            overflowY: 'auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.625rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            zIndex: 100,
            padding: '0.375rem',
          }}
        >
          <div
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Sticky Project Context</span>
            {activeProjectId && (
              <button
                onClick={() => {
                  setActiveProjectId(null);
                  setIsOpen(false);
                }}
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.6875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                }}
                title="Clear sticky project selection"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>

          <button
            onClick={() => {
              setActiveProjectId(null);
              setIsOpen(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.5rem 0.625rem',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: activeProjectId === null ? 'var(--bg-hover)' : 'transparent',
              color: activeProjectId === null ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontWeight: activeProjectId === null ? 600 : 400 }}>All Projects</span>
            {activeProjectId === null && <Check size={13} style={{ color: '#3b82f6' }} />}
          </button>

          <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />

          {projectList.length === 0 ? (
            <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              No projects found
            </div>
          ) : (
            projectList.map((p) => {
              const isSelected = Number(p.id) === Number(activeProjectId);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveProjectId(Number(p.id));
                    setIsOpen(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.45rem 0.625rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    color: isSelected ? '#3b82f6' : 'var(--text-primary)',
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: '0.125rem',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', overflow: 'hidden' }}>
                    <span style={{ fontWeight: isSelected ? 600 : 400, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {p.name}
                    </span>
                    {p.project_number && (
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        #{p.project_number}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
