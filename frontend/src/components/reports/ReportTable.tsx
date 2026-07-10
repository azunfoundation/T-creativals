'use client';

import React, { useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (val: any, row: any) => React.ReactNode;
}

interface ReportTableProps {
  columns: Column[];
  data: any[];
  pageSize?: number;
}

export default function ReportTable({ columns, data = [], pageSize = 10 }: ReportTableProps) {
  const [sortKey, setSortKey] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
    setCurrentPage(1);
  };

  // 1. Sort data
  const sortedData = [...data];
  if (sortKey) {
    sortedData.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === undefined || valB === undefined) return 0;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }

  // 2. Paginate data
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  return (
    <div className="data-table-wrap" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={{
                    cursor: col.sortable !== false ? 'pointer' : 'default',
                    textAlign: col.align || 'left',
                    userSelect: 'none'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start'
                  }}>
                    <span>{col.label}</span>
                    {col.sortable !== false && <ArrowUpDown size={12} style={{ opacity: 0.6 }} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No records found
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr key={rIdx}>
                  {columns.map((col) => {
                    const value = row[col.key];
                    return (
                      <td
                        key={col.key}
                        style={{
                          textAlign: col.align || 'left',
                          fontSize: '0.8125rem'
                        }}
                      >
                        {col.render ? col.render(value, row) : value !== null && value !== undefined ? String(value) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-elevated)',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)'
        }}>
          <div>
            Showing <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{startIndex + 1}</span> to{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{Math.min(startIndex + pageSize, totalItems)}</span> of{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalItems}</span> rows
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="btn btn-secondary btn-sm btn-icon"
              style={{ padding: '0.25rem' }}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              Page <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{currentPage}</span> of{' '}
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalPages}</span>
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn btn-secondary btn-sm btn-icon"
              style={{ padding: '0.25rem' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
