'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Send, Paperclip, Trash2, Pin, Plus, Search,
  MessageSquare, Check, AlertTriangle, Phone, Bot, User,
  Bookmark, ShieldAlert, BarChart3, FileText, ArrowRight, X,
  FileSpreadsheet, FileAudio, FileVideo, FileImage,
  ThumbsUp, ThumbsDown, Heart, Lightbulb, Sliders
} from 'lucide-react';
import { aiApi, filesApi, getApiErrorMessage, type AiConversation, type AiMessage, type AiAttachment } from '@/lib/api';
import VoiceAgentModal from '@/components/ai/VoiceAgentModal';
import { useToast } from '@/hooks/useToast';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const AI_HOWTO = {
  overview: 'Antigravity AI is the built-in assistant. You chat with it in plain English and it can answer questions about your company data — leads, tasks, invoices, projects — and take actions for you, like creating a task or drafting a record. You can also attach files for analysis or talk to it live with AI Voice Call.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "New Chat" in the left sidebar to start a conversation, or pick one of the suggested prompts on the welcome screen.',
        'Type a request in plain English and press Enter to send (Shift+Enter adds a new line).',
        'Attach files with the paperclip or drag & drop them anywhere on the page — PDFs, CSVs, spreadsheets, and images can be analyzed.',
        'Click "AI Voice Call" in the top bar to talk to the assistant by voice instead of typing.',
      ],
    },
    {
      heading: 'Working with conversations',
      items: [
        'Every chat is saved in the left sidebar — use the search box to find an old one.',
        'Hover a chat to pin it (keeps it handy), bookmark it, or delete it.',
        'When an answer contains a table of numbers, the page also renders it as a chart automatically.',
        'React to an answer with the thumbs up/down, heart, or lightbulb icons to record how useful it was.',
      ],
    },
    {
      heading: 'Phrasing requests',
      items: [
        'Be specific: "Show overdue tasks for the Acme project" works better than "show tasks".',
        'Ask one thing at a time, then follow up in the same chat to refine the answer.',
        'When asking it to create something, include the details it needs — names, dates, amounts.',
      ],
    },
    {
      heading: 'Good to know',
      items: [
        'Sensitive actions ask for your confirmation first — nothing risky runs until you click "Confirm Execution".',
        'The assistant works with the data inside this platform and the files you attach to a chat.',
        'It can make mistakes — double-check important numbers before sharing them with clients.',
        'For things you want done automatically every time, set up a rule under "Manage Automations" instead of asking in chat.',
      ],
    },
  ],
};

// ── Custom Interactive SVG Chart Component ────────────────────────
interface ChartProps {
  data: Array<{ label: string; value: number }>;
  type?: 'bar' | 'line' | 'pie';
}

function SvgChart({ data, type = 'bar' }: ChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const width = 500;
  const height = 220;
  const padding = 40;

  if (type === 'pie') {
    let accumulatedAngle = 0;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const radius = 70;
    const cx = 110;
    const cy = 110;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', padding: '1rem', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginTop: '0.75rem' }}>
        <svg width={220} height={220}>
          {data.map((slice, i) => {
            const angle = (slice.value / total) * 360;
            const x1 = cx + radius * Math.cos((accumulatedAngle * Math.PI) / 180);
            const y1 = cy + radius * Math.sin((accumulatedAngle * Math.PI) / 180);
            accumulatedAngle += angle;
            const x2 = cx + radius * Math.cos((accumulatedAngle * Math.PI) / 180);
            const y2 = cy + radius * Math.sin((accumulatedAngle * Math.PI) / 180);
            const largeArcFlag = angle > 180 ? 1 : 0;
            const colors = ['#7c3aed', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
            const color = colors[i % colors.length];

            return (
              <path
                key={slice.label}
                d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                fill={color}
                stroke="var(--surface-elevated)"
                strokeWidth={2}
              />
            );
          })}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.map((slice, i) => {
            const colors = ['#7c3aed', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
            const percent = ((slice.value / total) * 100).toFixed(1);
            return (
              <div key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: '3px', background: colors[i % colors.length] }} />
                <span style={{ color: 'var(--text-secondary)' }}>{slice.label}:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{slice.value} ({percent}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginTop: '0.75rem', overflowX: 'auto' }}>
      <svg width={width} height={height}>
        {/* Draw Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding + (1 - ratio) * (height - 2 * padding);
          return (
            <line
              key={ratio}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Render Bars / Lines */}
        {data.map((item, idx) => {
          const barWidth = 35;
          const spacing = (width - 2 * padding) / data.length;
          const x = padding + idx * spacing + (spacing - barWidth) / 2;
          const barHeight = (item.value / maxVal) * (height - 2 * padding);
          const y = height - padding - barHeight;

          if (type === 'line') {
            const next = data[idx + 1];
            const nextX = padding + (idx + 1) * spacing + (spacing - barWidth) / 2 + barWidth / 2;
            const currentX = x + barWidth / 2;
            const currentY = y;
            const nextY = next ? height - padding - (next.value / maxVal) * (height - 2 * padding) : 0;

            return (
              <g key={item.label}>
                {next && (
                  <line
                    x1={currentX}
                    y1={currentY}
                    x2={nextX}
                    y2={nextY}
                    stroke="#7c3aed"
                    strokeWidth={3}
                  />
                )}
                <circle cx={currentX} cy={currentY} r={5} fill="#ec4899" />
                <text
                  x={currentX}
                  y={height - 15}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="10"
                >
                  {item.label}
                </text>
                <text
                  x={currentX}
                  y={currentY - 10}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontWeight="600"
                  fontSize="10"
                >
                  {item.value}
                </text>
              </g>
            );
          }

          // Default Bar
          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill="url(#barGrad)"
                rx={4}
              />
              <text
                x={x + barWidth / 2}
                y={height - 15}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {item.label}
              </text>
              <text
                x={x + barWidth / 2}
                y={y - 8}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontWeight="600"
                fontSize="10"
              >
                {item.value}
              </text>
            </g>
          );
        })}
        
        {/* Gradients declaration */}
        <defs>
          <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ── Main Page Component ────────────────────────────────────────────
export default function AiPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [convToDelete, setConvToDelete] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [optimisticMsg, setOptimisticMsg] = useState<string | null>(null);
  
  // File Upload State
  const [attachedFiles, setAttachedFiles] = useState<Array<{ filename: string; file_path: string; mime_type: string; file_size: number; url: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Queries
  const { data: aiStatus } = useQuery({
    queryKey: ['ai_status'],
    queryFn: async () => (await aiApi.status()).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data: conversationsPage, isLoading: loadingConversations } = useQuery({
    queryKey: ['ai_conversations', searchQuery],
    queryFn: async () => {
      const res = await aiApi.listConversations(searchQuery);
      return res.data;
    }
  });
  const conversations = conversationsPage?.data || [];
  const hasMoreConversations = (conversationsPage?.last_page || 1) > 1;

  const { data: activeConversation, isLoading: loadingMessages } = useQuery({
    queryKey: ['ai_conversation', activeConversationId],
    queryFn: async () => {
      if (!activeConversationId) return null;
      const res = await aiApi.getConversation(activeConversationId);
      return res.data;
    },
    enabled: !!activeConversationId,
  });

  // Automatically select the latest conversation on initial load if none active
  useEffect(() => {
    if (conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations]);

  // Scroll to bottom of chat feed
  const scrollToBottom = () => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, loadingMessages]);

  // Mutations
  const createChatMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await aiApi.createConversation(title);
      return res.data;
    },
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
      setActiveConversationId(newConv.id);
    }
  });

  const chatMutation = useMutation({
    mutationFn: async (params: {
      content?: string;
      conversation_id?: number;
      attachments?: any[];
      confirmed_action?: string;
      confirmed_params?: any;
    }) => {
      const res = await aiApi.chat(params);
      return res.data;
    },
    onSuccess: (data) => {
      setOptimisticMsg(null);
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
      queryClient.invalidateQueries({ queryKey: ['ai_conversation', data.conversation_id] });
      setAttachedFiles([]);
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    },
    onError: (err: unknown) => {
      setOptimisticMsg(null);
      showToast(getApiErrorMessage(err, 'Failed to send message. Please try again.'), 'error');
    },
  });

  const deleteConvMutation = useMutation({
    mutationFn: async (id: number) => {
      await aiApi.deleteConversation(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
      setActiveConversationId(null);
    }
  });

  const togglePinMutation = useMutation({
    mutationFn: async (id: number) => {
      await aiApi.togglePin(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
    }
  });

  const toggleSaveMutation = useMutation({
    mutationFn: async (id: number) => {
      await aiApi.toggleSave(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
    }
  });

  const reactMutation = useMutation({
    mutationFn: async (params: { messageId: number; reaction: string }) => {
      await aiApi.reactToMessage(params.messageId, params.reaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversation', activeConversationId] });
    }
  });

  // Action confirmations
  const handleActionConfirm = (action: string, params: any) => {
    chatMutation.mutate({
      conversation_id: activeConversationId || undefined,
      confirmed_action: action,
      confirmed_params: params,
    });
  };

  const handleActionCancel = () => {
    queryClient.invalidateQueries({ queryKey: ['ai_conversation', activeConversationId] });
  };

  // Upload actions
  const handleFileUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const res = await filesApi.upload(file, 'attachment');
        setAttachedFiles((prev) => [...prev, {
          filename: res.data.filename,
          file_path: res.data.file_path,
          mime_type: res.data.mime_type,
          file_size: res.data.file_size,
          url: res.data.url,
        }]);
      } catch (err) {
        console.error("Upload failed", err);
        showToast(getApiErrorMessage(err, 'Failed to upload file.'), 'error');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleSendMessage = () => {
    if (chatMutation.isPending) return;
    if (!inputText.trim() && attachedFiles.length === 0) return;

    const msgText = inputText.trim();
    setOptimisticMsg(msgText);

    chatMutation.mutate({
      content: msgText,
      conversation_id: activeConversationId || undefined,
      attachments: attachedFiles.map((f) => ({
        filename: f.filename,
        file_path: f.file_path,
        mime_type: f.mime_type,
        file_size: f.file_size,
      })),
    });
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  const canSend = (inputText.trim().length > 0 || attachedFiles.length > 0) && !chatMutation.isPending;

  // Helpers
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const getAttachmentIcon = (mime: string) => {
    if (mime.includes('image')) return <FileImage size={15} color="#ec4899" />;
    if (mime.includes('pdf')) return <FileText size={15} color="#ef4444" />;
    if (mime.includes('csv') || mime.includes('sheet') || mime.includes('excel')) return <FileSpreadsheet size={15} color="#10b981" />;
    if (mime.includes('audio')) return <FileAudio size={15} color="#3b82f6" />;
    if (mime.includes('video')) return <FileVideo size={15} color="#eab308" />;
    return <FileText size={15} color="var(--text-secondary)" />;
  };

  // Detect and render customized tables / numeric lists as interactive SVG charts
  const renderMessageContent = (content: string) => {
    // Check if message content has table details that represent numeric lists
    // Example: | Month | Revenue | -> parse to data array
    const lines = content.split('\n');
    const tableLines = lines.filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
    
    if (tableLines.length > 2) {
      // Very basic table parser
      try {
        const rows = tableLines.slice(2).map((r) => {
          const cells = r.split('|').map((c) => c.trim()).filter((c) => c !== '');
          const label = cells[0];
          // Strip currency symbols and parse
          const value = parseFloat(cells[1]?.replace(/[$,]/g, '') || cells[2]?.replace(/[$,]/g, '') || '0');
          return { label, value };
        }).filter((r) => r.label && !isNaN(r.value));

        if (rows.length > 0) {
          // Render markdown text first, then append custom chart
          return (
            <div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }} />
              <div style={{ marginTop: '1rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Interactive Visualization</span>
                <SvgChart data={rows} type={content.includes('Pie') ? 'pie' : content.includes('Line') ? 'line' : 'bar'} />
              </div>
            </div>
          );
        }
      } catch (e) {
        // Fallback
      }
    }

    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }} />;
  };

  // Markdown renderer — proper ul/li, code, tables, headings
  const formatMarkdown = (text: string): string => {
    let clean = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    clean = clean.replace(/^### (.*$)/gim, '<h4 style="font-size:1rem;font-weight:700;margin:0.875rem 0 0.375rem;color:var(--text-primary)">$1</h4>');
    clean = clean.replace(/^## (.*$)/gim, '<h3 style="font-size:1.125rem;font-weight:700;margin:1rem 0 0.5rem;color:var(--text-primary)">$1</h3>');
    clean = clean.replace(/^# (.*$)/gim, '<h2 style="font-size:1.25rem;font-weight:700;margin:1.25rem 0 0.5rem;color:var(--text-primary)">$1</h2>');

    // Bold & Italics
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>');
    clean = clean.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline code
    clean = clean.replace(/`(.*?)`/g, '<code style="background:var(--surface-elevated);padding:2px 6px;border-radius:4px;font-size:0.875em;font-family:monospace;color:var(--accent)">$1</code>');

    // Bullet lists (*, -) — convert to proper li then wrap in ul
    const lines = clean.split('\n');
    let inList = false;
    const processed: string[] = [];
    for (const line of lines) {
      const bulletMatch = line.match(/^[\*\-]\s+(.*)$/);
      if (bulletMatch) {
        if (!inList) { processed.push('<ul style="margin:0.5rem 0;padding:0">'); inList = true; }
        processed.push(`<li style="margin-left:1.5rem;list-style-type:disc;margin-bottom:0.2rem;line-height:1.5">${bulletMatch[1]}</li>`);
      } else {
        if (inList) { processed.push('</ul>'); inList = false; }
        processed.push(line);
      }
    }
    if (inList) processed.push('</ul>');
    clean = processed.join('\n');

    // Numbered lists
    clean = clean.replace(/^(\d+)\.\s+(.*$)/gim, '<li style="margin-left:1.5rem;list-style-type:decimal;margin-bottom:0.2rem">$2</li>');

    // Horizontal rule
    clean = clean.replace(/^---$/gim, '<hr style="border:none;border-top:1px solid var(--border);margin:0.75rem 0">');

    // Markdown Tables
    if (clean.includes('|')) {
      clean = clean.replace(/(\|.*?\|)\n(\|[-|\s]*\|)\n((?:\|.*?\|\n?)+)/g, (match, header, divider, rows) => {
        const headers = header.split('|').map((h: string) => h.trim()).filter((h: string) => h !== '');
        const tableRows = rows.trim().split('\n').filter((r: string) => r.trim() !== '').map((row: string) =>
          row.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '')
        );
        const headerHtml = `<tr>${headers.map((h: string) => `<th style="padding:0.5rem 0.875rem;border-bottom:2px solid var(--border);text-align:left;font-size:0.8125rem;font-weight:600;color:var(--text-secondary);background:var(--surface-elevated)">${h}</th>`).join('')}</tr>`;
        const rowsHtml = tableRows.map((tr: string[], i: number) =>
          `<tr style="${i % 2 === 1 ? 'background:var(--surface-elevated)' : ''}">${tr.map((cell: string) => `<td style="padding:0.5rem 0.875rem;border-bottom:1px solid var(--border);font-size:0.8125rem;color:var(--text-primary)">${cell}</td>`).join('')}</tr>`
        ).join('');
        return `<table style="width:100%;border-collapse:collapse;margin:1rem 0;border:1px solid var(--border);border-radius:6px;overflow:hidden"><thead>${headerHtml}</thead><tbody>${rowsHtml}</tbody></table>`;
      });
    }

    // Line breaks
    clean = clean.replace(/\n\n/g, '</p><p style="margin:0.5rem 0">');
    clean = clean.replace(/\n/g, '<br>');

    return `<p style="margin:0;line-height:1.65">${clean}</p>`;
  };

  return (
    <div 
      onDragOver={handleDragOver}
      style={{
        display: 'flex',
        height: 'calc(100vh - var(--topbar-height) - 1.5rem)',
        background: 'var(--background)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      {/* ── Drag & Drop Overlay ── */}
      {isDragging && (
        <div 
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(124, 58, 237, 0.15)',
            border: '2px dashed var(--accent)',
            backdropFilter: 'blur(4px)',
            zIndex: 90,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <Sparkles size={50} color="var(--accent)" className="animate-pulse" />
          <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>Drop files here to analyze</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>PDF, CSV, XLSX, Images, and more</p>
        </div>
      )}

      {/* ── Left Sidebar (Conversations List) ── */}
      <aside style={{
        width: 320,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Search & Actions */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={() => createChatMutation.mutate('New Chat')}
            disabled={createChatMutation.isPending}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.625rem',
              background: 'var(--accent)', color: '#fff',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem', fontWeight: 600,
              boxShadow: 'var(--shadow-glow)',
              opacity: createChatMutation.isPending ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <Plus size={16} /> New Chat
          </button>
          
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search chat history…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* History Stream */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {loadingConversations ? (
            <div style={{ display: 'flex', padding: '2rem', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Loading logs…
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '3rem 1rem' }}>
              No chats found. Create a new one to begin.
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: isActive ? 'var(--accent-subtle)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    marginBottom: '2px',
                    transition: 'all 0.15s ease',
                  }}
                  className="group"
                >
                  <MessageSquare size={16} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8375rem', fontWeight: isActive ? 600 : 400 }}>
                    {conv.title === 'New Chat' && (conv.messages?.length ?? 0) > 0
                      ? ((conv.messages?.[0]?.content?.slice(0, 36) ?? '') + ((conv.messages?.[0]?.content?.length ?? 0) > 36 ? '\u2026' : ''))
                      : conv.title}
                  </div>
                  {/* Actions buttons (visible on hover) */}
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePinMutation.mutate(conv.id); }}
                      title="Pin Conversation"
                      style={{ color: conv.is_pinned ? 'var(--warning)' : 'var(--text-muted)', padding: '2px' }}
                    >
                      <Pin size={13} fill={conv.is_pinned ? 'var(--warning)' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSaveMutation.mutate(conv.id); }}
                      title="Bookmark Chat"
                      style={{ color: conv.is_saved ? 'var(--accent)' : 'var(--text-muted)', padding: '2px' }}
                    >
                      <Bookmark size={13} fill={conv.is_saved ? 'var(--accent)' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConvToDelete(conv.id); }}
                      title="Delete Conversation"
                      style={{ color: 'var(--danger)', padding: '2px' }}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {hasMoreConversations && (
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>
              Showing your 50 most recent chats — use search to find older ones.
            </p>
          )}
        </div>
      </aside>

      {/* ── Right Main Area ── */}
      <section style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-elevated)',
      }}>
        {/* Active Top bar */}
        <header style={{
            height: 60,
            padding: '0 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface)',
          }}>
            <div>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {activeConversation?.title === 'New Chat' && (activeConversation?.messages?.length ?? 0) > 0
                  ? activeConversation.messages?.[0]?.content?.slice(0, 52) ?? 'New Chat'
                  : (activeConversation?.title ?? 'Antigravity AI')}
                <HelpIcon title="Antigravity AI Assistant" content={{
                  what: 'A chat assistant that can read your company data (leads, tasks, invoices, projects), analyze files you attach, and take actions you ask for.',
                  why: 'It saves you digging through pages — ask "What\'s the revenue this month?" or "Create a follow-up task" and it does the legwork.',
                  when: 'Any time you need a quick answer or a routine action. It asks you to confirm before executing anything sensitive.',
                }} />
              </h2>
              <p style={{ fontSize: '0.6875rem', color: chatMutation.isPending ? 'var(--accent)' : 'var(--text-muted)', marginTop: '2px', fontWeight: chatMutation.isPending ? 600 : 400 }}>
                {chatMutation.isPending
                  ? '● Thinking…'
                  : aiStatus && !aiStatus.configured
                    ? '● Simulation mode — no AI model connected'
                    : '● AI Operating Assistant'}
              </p>
            </div>

            {aiStatus && !aiStatus.configured && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.6875rem', fontWeight: 600,
                padding: '0.25rem 0.625rem', borderRadius: 999,
                background: 'var(--warning-subtle)', color: 'var(--warning)',
                border: '1px solid rgba(245,158,11,0.25)',
              }}>
                Simulation mode
                <HelpIcon text="No AI API key is configured on the server, so replies here are canned demonstrations — not a real model reading your data. Ask your administrator to set GEMINI_API_KEY to enable the real assistant." size={11} />
              </span>
            )}
            
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <HowToUseGuide moduleKey="ai-assistant" title="How the AI Assistant Works" content={AI_HOWTO} />
              <Link
                href="/ai/automations"
                title="Manage Automations"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.875rem',
                  background: 'var(--surface-elevated)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem', fontWeight: 600,
                  transition: 'all 0.15s ease',
                  textDecoration: 'none',
                }}
                className="hover:text-primary"
              >
                <Sliders size={14} /> Manage Automations
              </Link>
              <button
                onClick={() => setIsVoiceOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.875rem',
                  background: 'var(--accent-subtle)', color: 'var(--accent)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem', fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
                className="hover:brightness-110"
              >
                <Phone size={14} /> AI Voice Call
              </button>
            </div>
          </header>

        {/* Message Thread */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {loadingMessages ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '0.5rem' }}>
              <Bot size={18} /> Loading conversation…
            </div>
          ) : !activeConversationId ? (
            <div style={{ display: 'flex', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(124,58,237,0.3)' }}>
                <Sparkles size={30} color="#fff" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Welcome to Antigravity AI</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: 380, lineHeight: 1.6 }}>Your executive assistant — analyze reports, manage leads, create tasks, invoices and more.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {["What's the revenue this month?", "Show overdue tasks", "List hot CRM leads", "Create a new project"].map((prompt) => (
                  <button key={prompt} onClick={() => { setInputText(prompt); createChatMutation.mutate(prompt.slice(0, 48)); }}
                    style={{ padding: '0.5rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '0.8125rem', cursor: 'pointer', transition: 'all 0.15s' }}
                    className="hover:border-accent hover:text-accent">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {activeConversation?.messages?.map((msg) => {
                const isAI = msg.role === 'assistant';
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex', gap: '1rem',
                      alignItems: 'flex-start',
                      justifyContent: isAI ? 'flex-start' : 'flex-end',
                    }}
                  >
                    {isAI && (
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                        flexShrink: 0,
                      }}>
                        <Bot size={15} color="#fff" />
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxWidth: '75%' }}>
                      <div style={{
                        padding: '0.875rem 1rem',
                        background: isAI ? 'var(--surface)' : 'var(--accent)',
                        border: isAI ? '1px solid var(--border)' : 'none',
                        color: isAI ? 'var(--text-primary)' : '#fff',
                        borderRadius: isAI ? '0 var(--radius-lg) var(--radius-lg) var(--radius-lg)' : 'var(--radius-lg) 0 var(--radius-lg) var(--radius-lg)',
                        fontSize: '0.9375rem',
                      }}>
                        {renderMessageContent(msg.content)}
                      </div>

                      {/* Attachments rendering */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                          {msg.attachments.map((file) => (
                            <a
                              key={file.id}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.375rem 0.625rem',
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem', color: 'var(--text-secondary)',
                                textDecoration: 'none',
                              }}
                              className="hover:border-accent"
                            >
                              {getAttachmentIcon(file.mime_type)}
                              <span>{file.filename}</span>
                              <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>({formatSize(file.file_size)})</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Reactions & Info Bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isAI && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {([
                              { reaction: 'like',    Icon: ThumbsUp,    label: 'Like' },
                              { reaction: 'dislike', Icon: ThumbsDown,  label: 'Dislike' },
                              { reaction: 'love',    Icon: Heart,       label: 'Love' },
                              { reaction: 'insight', Icon: Lightbulb,   label: 'Insight' },
                            ] as const).map(({ reaction, Icon, label }) => {
                              const reactions = msg.reactions || [];
                              const active = reactions.includes(reaction);
                              return (
                                <button
                                  key={reaction}
                                  title={label}
                                  onClick={() => reactMutation.mutate({ messageId: msg.id, reaction })}
                                  style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: 26, height: 26,
                                    borderRadius: '6px',
                                    background: active ? 'var(--accent-subtle)' : 'transparent',
                                    border: active ? '1px solid var(--accent)' : '1px solid transparent',
                                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                                    transition: 'all 0.15s ease',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Icon size={13} />
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {!isAI && (
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <User size={15} color="var(--text-secondary)" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Optimistic user message while waiting */}
              {optimisticMsg && chatMutation.isPending && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '75%' }}>
                    <div style={{ padding: '0.875rem 1rem', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', borderRadius: 'var(--radius-lg) 0 var(--radius-lg) var(--radius-lg)', fontSize: '0.9375rem', opacity: 0.85 }}>
                      <span style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{optimisticMsg}</span>
                    </div>
                  </div>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={15} color="var(--text-secondary)" />
                  </div>
                </div>
              )}

              {/* Sensitive Action Confirmation */}
              {chatMutation.data?.action_confirmation && (
                <div style={{ background: 'var(--surface)', border: '2px solid var(--warning)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '480px', alignSelf: 'center', boxShadow: 'var(--shadow-lg)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <ShieldAlert size={24} color="var(--warning)" style={{ flexShrink: 0 }} />
                    <div>
                      <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Action Confirmation Required</h4>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>{chatMutation.data.action_confirmation.message}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => queryClient.invalidateQueries({ queryKey: ['ai_conversation', activeConversationId] })} style={{ padding: '0.5rem 1rem', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', fontWeight: 600 }}>Cancel</button>
                    <button onClick={() => handleActionConfirm(chatMutation.data.action_confirmation!.action, chatMutation.data.action_confirmation!.params)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', background: 'var(--success)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', fontWeight: 600 }}><Check size={14} /> Confirm Execution</button>
                  </div>
                </div>
              )}

              {/* AI Typing indicator — no animationDelay conflict */}
              {chatMutation.isPending && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={15} color="#fff" />
                  </div>
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0 var(--radius-lg) var(--radius-lg) var(--radius-lg)', display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <style>{`@keyframes bDot{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <span key={i} style={{ width: 7, height: 7, background: 'var(--text-muted)', borderRadius: '50%', display: 'inline-block', animation: `bDot 0.9s ${delay}s infinite ease-in-out` }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={feedEndRef} />
            </div>
          )}
        </div>

        {/* Input Dock */}
        {activeConversationId && (
          <div style={{ padding: '1rem 1.5rem 1.5rem', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
            {/* Attachment preview list */}
            {attachedFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      background: 'var(--surface-elevated)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', fontSize: '0.75rem',
                    }}
                  >
                    {getAttachmentIcon(file.mime_type)}
                    <span style={{ color: 'var(--text-primary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.filename}</span>
                    <button
                      onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ color: 'var(--danger)', display: 'flex' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input elements row */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: '0.75rem',
              background: 'var(--surface-elevated)',
              border: `1px solid ${canSend ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)', padding: '0.375rem 0.75rem',
              transition: 'border-color 0.15s',
            }}>
              {/* Attachment selector */}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ color: 'var(--text-secondary)', padding: '0.375rem', flexShrink: 0 }}
                className="hover:text-primary"
                title="Attach file"
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                style={{ display: 'none' }}
              />

              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Message Antigravity or drop documents here…"
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                style={{
                  flex: 1,
                  background: 'none', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: '0.9375rem',
                  resize: 'none', padding: '0.5rem 0',
                  maxHeight: '140px', lineHeight: 1.5,
                }}
              />

              <button
                onClick={handleSendMessage}
                disabled={!canSend}
                style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: canSend ? 'var(--accent)' : 'var(--surface)',
                  color: canSend ? '#fff' : 'var(--text-muted)',
                  border: canSend ? 'none' : '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                }}
              >
                <Send size={15} />
              </button>
            </div>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
              Shift+Enter for new line · Enter to send · Drag &amp; drop files supported
            </p>
          </div>
        )}
      </section>

      {convToDelete !== null && (
        <ConfirmModal
          title="Delete Conversation"
          message="Delete this chat and its full message history? This cannot be undone."
          confirmLabel="Delete Chat"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => { deleteConvMutation.mutate(convToDelete); setConvToDelete(null); }}
          onCancel={() => setConvToDelete(null)}
        />
      )}

      {/* ── Voice Call overlay modal ── */}
      {isVoiceOpen && (
        <VoiceAgentModal
          isOpen={isVoiceOpen}
          onClose={() => setIsVoiceOpen(false)}
          conversationId={activeConversationId || undefined}
          onNewMessage={() => queryClient.invalidateQueries({ queryKey: ['ai_conversation', activeConversationId] })}
        />
      )}
    </div>
  );
}
