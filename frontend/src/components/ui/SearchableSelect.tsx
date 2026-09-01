'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  required = false,
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectId = useId();

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  const filteredOptions = options.filter((opt) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      opt.label.toLowerCase().includes(query) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(query))
    );
  });

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard shortcuts (Escape key)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      style={{ position: 'relative', width: '100%' }}
      className={className}
    >
      {/* Hidden native input to satisfy form validation if required */}
      {required && (
        <input
          type="text"
          value={value ? String(value) : ''}
          required={required}
          onChange={() => {}}
          style={{
            position: 'absolute',
            opacity: 0,
            width: 1,
            height: 1,
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
          tabIndex={-1}
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        id={selectId}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="form-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '42px',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '0 0.875rem',
          background: 'var(--surface-elevated, #ffffff)',
          borderColor: isOpen ? 'var(--accent, #7c3aed)' : undefined,
          boxShadow: isOpen ? '0 0 0 2px rgba(124, 58, 237, 0.15)' : undefined,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selectedOption ? 'var(--text-primary, #0f172a)' : 'var(--text-muted, #94a3b8)',
            fontSize: '0.875rem',
            fontWeight: selectedOption ? 500 : 400,
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0, marginLeft: '0.5rem' }}>
          {value && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              style={{
                color: 'var(--text-muted)',
                padding: '2px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hover:text-danger hover:bg-surface"
              title="Clear selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            style={{
              color: 'var(--text-muted)',
              transition: 'transform 0.2s ease',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {/* Searchable Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--surface-elevated, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 'var(--radius-md, 0.5rem)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '280px',
          }}
        >
          {/* Search Bar Input */}
          <div
            style={{
              padding: '0.625rem 0.75rem',
              borderBottom: '1px solid var(--border, #e2e8f0)',
              position: 'relative',
              background: 'var(--surface, #f8fafc)',
            }}
          >
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type to search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{
                paddingLeft: '2.25rem',
                paddingRight: '2rem',
                height: '34px',
                fontSize: '0.8125rem',
                width: '100%',
                background: 'var(--surface-elevated, #ffffff)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Result Count Bar */}
          <div
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              background: 'var(--surface, #f8fafc)',
              borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{searchQuery ? `Found ${filteredOptions.length} matches` : `${options.length} total available`}</span>
            {searchQuery && <span>Search active</span>}
          </div>

          {/* Options Scroll List */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              padding: '0.25rem 0',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem 1rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.8125rem',
                }}
              >
                No results matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(String(opt.value));
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.875rem',
                      textAlign: 'left',
                      background: isSelected ? 'var(--accent-subtle, rgba(124, 58, 237, 0.1))' : 'transparent',
                      color: isSelected ? 'var(--accent, #7c3aed)' : 'var(--text-primary, #0f172a)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      transition: 'background 0.15s ease',
                    }}
                    className="hover:bg-[var(--surface-hover)]"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingRight: '0.5rem' }}>
                      <span style={{ fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {opt.label}
                      </span>
                      {opt.sublabel && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opt.sublabel}
                        </span>
                      )}
                    </div>

                    {isSelected && <Check size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />}
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
