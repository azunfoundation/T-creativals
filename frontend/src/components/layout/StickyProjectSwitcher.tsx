'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useQuery } from '@tanstack/react-query';
import { projects as projectsApi, Project } from '@/lib/api';
import { Layers, ChevronDown, Check, X, Search } from 'lucide-react';

export function StickyProjectSwitcher() {
  const { activeProjectId, setActiveProjectId } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const { data: projectsData } = useQuery({
    queryKey: ['sticky_projects_list'],
    queryFn: async () => {
      const res = await projectsApi.list({ per_page: 100 });
      const raw = res.data;
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray((raw as any).data)) return (raw as any).data as Project[];
      return [];
    },
    staleTime: 60_000,
  });

  const projectList: Project[] = Array.isArray(projectsData) ? projectsData : [];
  const activeProject = projectList.find((p) => Number(p.id) === Number(activeProjectId));

  const filteredProjects = projectList.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.project_number && p.project_number.toLowerCase().includes(q))
    );
  });

  // Total selectable items: "All Projects" (index 0) + filteredProjects
  const allSelectableItems = [null, ...filteredProjects.map((p) => p.id)];

  const handleKeyDownInMenu = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % allSelectableItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allSelectableItems.length) % allSelectableItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetId = allSelectableItems[selectedIndex];
      setActiveProjectId(targetId !== null ? Number(targetId) : null);
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative inline-block text-left" style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="topbar-workspace-switcher-btn"
        title="Current Workspace Context — filters dashboard data & preselects project across workflows"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.375rem 0.75rem',
          borderRadius: '0.5rem',
          background: activeProject ? 'rgba(124, 58, 237, 0.12)' : 'var(--surface-elevated)',
          border: activeProject ? '1px solid rgba(124, 58, 237, 0.35)' : '1px solid var(--border)',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: activeProject ? 'var(--accent)' : 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'all 0.15s ease-in-out',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <Layers size={14} style={{ color: activeProject ? 'var(--accent)' : 'var(--text-muted)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Workspace:
          </span>
          <span
            style={{
              maxWidth: '130px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeProject ? activeProject.name : 'All Projects'}
          </span>
        </div>
        <ChevronDown size={12} style={{ opacity: 0.7, marginLeft: '0.1rem' }} />
      </button>

      {isOpen && (
        <div
          className="topbar-workspace-menu"
          onKeyDown={handleKeyDownInMenu}
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.375rem)',
            right: 0,
            width: '280px',
            maxHeight: '400px',
            background: 'var(--surface)',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            boxShadow: 'var(--shadow-lg), 0 10px 25px -5px rgba(0, 0, 0, 0.4)',
            zIndex: 1000,
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
          }}
        >
          {/* Header & Title */}
          <div
            style={{
              padding: '0.25rem 0.375rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '0.01em',
              }}
            >
              Current Workspace
            </span>
            {activeProjectId !== null && (
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
                  gap: '0.25rem',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '0.25rem',
                }}
                title="Switch back to All Projects"
              >
                <X size={11} /> Reset
              </button>
            )}
          </div>

          {/* Context Helper Text */}
          <div
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.6875rem',
              color: 'var(--text-secondary)',
              background: 'var(--surface-elevated)',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-subtle)',
              lineHeight: 1.3,
            }}
          >
            New tasks, timesheets, expenses, documents, and dashboard data will use this workspace until you switch.
          </div>

          {/* Search Box if > 3 projects */}
          {projectList.length > 3 && (
            <div style={{ position: 'relative', marginTop: '0.125rem' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                id={searchId}
                ref={searchInputRef}
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '30px',
                  paddingLeft: '1.75rem',
                  paddingRight: '0.5rem',
                  fontSize: '0.75rem',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.375rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Options List */}
          <div
            style={{
              maxHeight: '230px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.125rem',
              marginTop: '0.125rem',
            }}
          >
            {/* All Projects Option */}
            <button
              onClick={() => {
                setActiveProjectId(null);
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
                background:
                  activeProjectId === null
                    ? 'rgba(124, 58, 237, 0.12)'
                    : selectedIndex === 0
                    ? 'var(--surface-hover)'
                    : 'transparent',
                color: activeProjectId === null ? 'var(--accent)' : 'var(--text-primary)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: activeProjectId === null ? 600 : 400 }}>
                  All Projects
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Organization-wide workspace
                </span>
              </div>
              {activeProjectId === null && <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            </button>

            <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />

            {filteredProjects.length === 0 ? (
              <div
                style={{
                  padding: '0.625rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                No matching projects found
              </div>
            ) : (
              filteredProjects.map((p, idx) => {
                const isSelected = Number(p.id) === Number(activeProjectId);
                const itemIndex = idx + 1;
                const isFocused = selectedIndex === itemIndex;

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
                      background: isSelected
                        ? 'rgba(124, 58, 237, 0.12)'
                        : isFocused
                        ? 'var(--surface-hover)'
                        : 'transparent',
                      color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', overflow: 'hidden' }}>
                      <span
                        style={{
                          fontWeight: isSelected ? 600 : 400,
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                      >
                        {p.name}
                      </span>
                      {p.project_number && (
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          #{p.project_number}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
