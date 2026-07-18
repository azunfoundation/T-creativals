import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined, currency: any = 'INR'): string {
  // Null-safe: convert to number and default to 0 if NaN/null/undefined
  const safeAmount = amount === null || amount === undefined ? 0 : Number(amount);
  const numericAmount = isNaN(safeAmount) ? 0 : safeAmount;

  let currencyCode = 'INR';
  if (typeof currency === 'string') {
    currencyCode = currency;
  } else if (currency && typeof currency === 'object') {
    currencyCode = currency.code || currency.currency_code || 'INR';
  }

  if (typeof currencyCode !== 'string' || currencyCode.length !== 3) {
    currencyCode = 'INR';
  }

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  } catch {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  }
}

export function formatDate(date: string | Date): string {
  if (!date) return '—';
  
  // Hand-parse standard ISO date format YYYY-MM-DD to avoid timezone conversion shift
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const parts = date.split('T')[0].split('-');
    const year = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${day.toString().padStart(2, '0')} ${months[monthIdx]}, ${year}`;
    }
  }

  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = d.getDate().toString().padStart(2, '0');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month}, ${year}`;
}

export function formatToInputDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '';
  const str = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function calculateDuration(startDateStr?: string, endDateStr?: string): string {
  if (!startDateStr || !endDateStr) return '—';
  const start = new Date(startDateStr.split('T')[0]);
  const end = new Date(endDateStr.split('T')[0]);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
  
  const diffTime = end.getTime() - start.getTime();
  if (diffTime < 0) return '—';
  
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 30) {
    return `${diffDays} Day${diffDays !== 1 ? 's' : ''}`;
  }
  
  const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return `${diffMonths} Month${diffMonths !== 1 ? 's' : ''}`;
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
