'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, Loader2, X, AlertCircle } from 'lucide-react';
import { filesApi, FileUploadResponse, getApiErrorMessage } from '@/lib/api';

interface FileUploadProps {
  type?: 'avatar' | 'logo' | 'receipt' | 'attachment';
  onUploadComplete: (data: FileUploadResponse) => void;
  onUploadStart?: () => void;
  onUploadError?: (error: string) => void;
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
  label?: string;
  className?: string;
}

export function FileUpload({
  type = 'attachment',
  onUploadComplete,
  onUploadStart,
  onUploadError,
  allowedMimeTypes,
  maxSizeBytes,
  label,
  className = '',
}: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Default validation rules based on type
  const getLimits = () => {
    switch (type) {
      case 'avatar':
      case 'logo':
        return {
          maxSize: maxSizeBytes ?? 2 * 1024 * 1024, // 2MB
          mimeTypes: allowedMimeTypes ?? ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'],
          desc: 'Images only (JPEG, PNG, WEBP, GIF), max 2MB',
        };
      case 'receipt':
        return {
          maxSize: maxSizeBytes ?? 5 * 1024 * 1024, // 5MB
          mimeTypes: allowedMimeTypes ?? ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
          desc: 'PDF or Images (JPEG, PNG), max 5MB',
        };
      case 'attachment':
      default:
        return {
          maxSize: maxSizeBytes ?? 10 * 1024 * 1024, // 10MB
          mimeTypes: allowedMimeTypes ?? [
            'image/jpeg',
            'image/png',
            'image/jpg',
            'application/pdf',
            'application/zip',
            'application/x-zip-compressed',
            'application/x-rar-compressed',
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
          ],
          desc: 'PDF, Word, Excel, ZIP, Text or Images, max 10MB',
        };
    }
  };

  const limits = getLimits();

  const validateAndUpload = async (file: File) => {
    setErrorMsg(null);

    // 1. Validate size
    if (file.size > limits.maxSize) {
      const sizeStr = (limits.maxSize / (1024 * 1024)).toFixed(0) + 'MB';
      const msg = `File is too large. Maximum size allowed is ${sizeStr}.`;
      setErrorMsg(msg);
      if (onUploadError) onUploadError(msg);
      return;
    }

    // 2. Validate mime type
    // If browser doesn't detect type (e.g. some rar configurations), check extension or allow it
    if (file.type && !limits.mimeTypes.includes(file.type)) {
      // Allow fallback check on common file extensions
      const ext = file.name.split('.').pop()?.toLowerCase();
      const validExtensions = {
        avatar: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        logo: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        receipt: ['jpg', 'jpeg', 'png', 'pdf'],
        attachment: ['jpg', 'jpeg', 'png', 'pdf', 'zip', 'rar', 'csv', 'xlsx', 'xls', 'docx', 'doc', 'txt'],
      }[type];

      if (!ext || !validExtensions.includes(ext)) {
        const msg = 'Unsupported file type.';
        setErrorMsg(msg);
        if (onUploadError) onUploadError(msg);
        return;
      }
    }

    // 3. Perform Upload
    setUploading(true);
    if (onUploadStart) onUploadStart();

    try {
      const response = await filesApi.upload(file, type);
      // response.data will be the FileUploadResponse details since interceptor extracts response.data.data
      onUploadComplete(response.data);
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Failed to upload file. Please try again.');
      setErrorMsg(msg);
      if (onUploadError) onUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className={className} style={{ width: '100%' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '0.5rem',
          }}
        >
          {label}
        </label>
      )}

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        style={{
          border: isDragActive ? '2px dashed var(--accent)' : '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: isDragActive ? 'var(--surface-hover)' : 'var(--surface)',
          padding: '1.5rem',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          opacity: uploading ? 0.7 : 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '130px',
        }}
        onMouseEnter={(e) => {
          if (!uploading) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.background = 'var(--surface-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!uploading) {
            e.currentTarget.style.borderColor = isDragActive ? 'var(--accent)' : 'var(--border)';
            e.currentTarget.style.background = isDragActive ? 'var(--surface-hover)' : 'var(--surface)';
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleChange}
          disabled={uploading}
        />

        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Uploading file...</span>
          </div>
        ) : (
          <>
            <UploadCloud size={32} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Drag & drop file here, or <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>browse</span>
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {limits.desc}
            </span>
          </>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'var(--danger-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--danger-border, rgba(239, 68, 68, 0.2))',
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{errorMsg}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setErrorMsg(null);
              }}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--danger)',
                padding: '0 2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
