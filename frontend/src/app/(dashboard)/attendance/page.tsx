'use client';

import { useState, useEffect, useMemo } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon, Clock, Play, Square,
  Plus, Check, X, Trash2, Pencil
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatDate } from '@/lib/utils';
import {
  attendanceApi, leaveApi, holidaysApi, getApiErrorMessage,
  type AttendanceStatus, type TeamAttendanceEntry, type LeaveRequest, type LeaveType, type Holiday,
} from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { InputModal } from '@/components/ui/InputModal';

// Available work locations
const LOCATIONS = ['Office', 'Remote', 'Client Site'];

const ATTENDANCE_HOWTO = {
  overview: 'Clock in when you start work and clock out when you finish. HR/founders can review the whole team\'s live status, manage leave requests, and maintain the corporate holiday calendar.',
  sections: [
    {
      heading: 'Clocking in and out',
      items: [
        'Clock in once per day from "My Attendance" — pick a location and add optional notes.',
        'Clock out at the end of your day and enter any break minutes taken; they\'re subtracted from your worked hours.',
        'Working under 5 hours in a day is automatically marked "Partial" instead of "Present".',
      ],
    },
    {
      heading: 'Leave requests',
      items: [
        'Use "Request Leave" to apply — pick a leave type, date range, and an optional reason.',
        'You can cancel your own request while it\'s still pending.',
        'HR/founders approve or reject pending requests from the "Pending Approval Requests" panel.',
      ],
    },
    {
      heading: 'Holiday calendar',
      items: [
        'The Holiday Calendar tab lists the company\'s official holidays for the selected year.',
        'HR/founders can add, and delete holidays from this tab.',
      ],
    },
  ],
};

function formatWorkedMinutes(mins?: number | null): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function AttendancePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'my_attendance' | 'team_registry' | 'leave_requests' | 'holidays'>('my_attendance');

  // Month & Year select for My Attendance
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Clock state
  const [timerText, setTimerText] = useState('00:00:00');
  const [clockInNotes, setClockInNotes] = useState('');
  const [clockInLocation, setClockInLocation] = useState('Office');

  // Modals state
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(false);
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [rejectLeaveId, setRejectLeaveId] = useState<number | null>(null);
  const [deleteLeaveId, setDeleteLeaveId] = useState<number | null>(null);
  const [deleteHolidayId, setDeleteHolidayId] = useState<number | null>(null);
  const [deleteAttendanceRecordId, setDeleteAttendanceRecordId] = useState<number | null>(null);

  // Leave Form State
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  // Holiday Form State
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayType, setHolidayType] = useState('national');
  const [holidayDesc, setHolidayDesc] = useState('');

  // HR: Add/Correct Attendance Record Form State
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [amUserId, setAmUserId] = useState('');
  const [amUserName, setAmUserName] = useState('');
  const [amUserLocked, setAmUserLocked] = useState(false);
  const [amDate, setAmDate] = useState('');
  const [amStatus, setAmStatus] = useState<AttendanceStatus>('present');
  const [amCheckIn, setAmCheckIn] = useState('');
  const [amCheckOut, setAmCheckOut] = useState('');
  const [amBreak, setAmBreak] = useState('');
  const [amNotes, setAmNotes] = useState('');

  // Permission checks — sourced from the authenticated user's real permission
  // grants (assigned server-side via RolesPermissionsSeeder), not a guessed
  // list of role names. Keeps the UI in lockstep with what the backend
  // actually authorizes instead of rendering actions that then 403.
  const permissions = useMemo(() => user?.permissions || [], [user]);
  const canViewTeam = permissions.includes('attendance.view_all');
  const canManageAttendance = permissions.includes('attendance.manage');
  const canViewAllLeave = permissions.includes('leave.view_all');
  const canApproveLeave = permissions.includes('leave.approve');
  const canManageHolidays = permissions.includes('holidays.manage');

  // Years offered on the Holiday Calendar — always centered on the current year
  // instead of a hardcoded range that goes stale.
  const holidayYearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, []);

  // ─── API Queries ────────────────────────────────────────────────────────────

  // Today's attendance status
  const { data: todayRecordRes, isLoading: loadingToday } = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => attendanceApi.today(),
  });
  const todayRecord = todayRecordRes?.data;

  // Monthly stats summary
  const { data: summaryRes } = useQuery({
    queryKey: ['attendance', 'summary', currentMonth, currentYear],
    queryFn: () => attendanceApi.summary({ month: currentMonth, year: currentYear }),
  });
  const summary = summaryRes?.data;

  // Monthly attendance logs list
  const { data: logsRes, isLoading: loadingLogs } = useQuery({
    queryKey: ['attendance', 'logs', currentMonth, currentYear],
    queryFn: () => attendanceApi.list({ month: currentMonth, year: currentYear }),
  });
  const logsList = logsRes?.data?.data || [];

  // Team registry list (HR only)
  const { data: teamRes } = useQuery({
    queryKey: ['attendance', 'team'],
    queryFn: () => attendanceApi.team(),
    enabled: canViewTeam && activeTab === 'team_registry',
  });
  const teamRegistry: TeamAttendanceEntry[] = teamRes?.data || [];

  // Leave types list
  const { data: leaveTypesRes } = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => leaveApi.types(),
    enabled: activeTab === 'leave_requests',
  });
  const leaveTypes: LeaveType[] = leaveTypesRes?.data || [];

  // Leave requests list
  const { data: leaveRequestsRes } = useQuery({
    queryKey: ['leave', 'requests'],
    queryFn: () => leaveApi.list(),
    enabled: activeTab === 'leave_requests',
  });
  const leaveRequestsList: LeaveRequest[] = leaveRequestsRes?.data?.data || [];

  // Holidays list
  const { data: holidaysRes } = useQuery({
    queryKey: ['holidays', currentYear],
    queryFn: () => holidaysApi.list({ year: currentYear }),
    enabled: activeTab === 'holidays',
  });
  const holidaysList: Holiday[] = holidaysRes?.data || [];

  // ─── Live Timer Effect ──────────────────────────────────────────────────────
  useEffect(() => {
    let interval: any;
    if (todayRecord && todayRecord.check_in_at && !todayRecord.check_out_at) {
      const checkInTime = new Date(todayRecord.check_in_at).getTime();
      interval = setInterval(() => {
        const diff = new Date().getTime() - checkInTime;
        const hrs = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setTimerText(`${hrs}:${mins}:${secs}`);
      }, 1000);
    } else {
      setTimerText('00:00:00');
    }
    return () => clearInterval(interval);
  }, [todayRecord]);

  // ─── API Mutations ──────────────────────────────────────────────────────────

  // Clock In
  const clockInMutation = useMutation({
    mutationFn: (data: { notes?: string; location?: string }) => attendanceApi.clockIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      showToast('Clocked in successfully!', 'success');
      setClockInNotes('');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to clock in.'), 'error');
    }
  });

  // Clock Out
  const clockOutMutation = useMutation({
    mutationFn: (data: { break_minutes: number }) => attendanceApi.clockOut(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      showToast('Clocked out successfully!', 'success');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to clock out.'), 'error');
    }
  });

  // Apply Leave
  const applyLeaveMutation = useMutation({
    mutationFn: (data: any) => leaveApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      showToast('Leave request submitted successfully!', 'success');
      setShowApplyLeaveModal(false);
      setLeaveTypeId('');
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveReason('');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to apply for leave.'), 'error');
    }
  });

  // Approve Leave (HR)
  const approveLeaveMutation = useMutation({
    mutationFn: (id: number) => leaveApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      showToast('Leave request approved.', 'success');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to approve leave.'), 'error');
    }
  });

  // Reject Leave (HR)
  const rejectLeaveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => leaveApi.reject(id, { rejection_reason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      showToast('Leave request rejected.', 'success');
      setRejectLeaveId(null);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to reject leave.'), 'error');
    }
  });

  // Delete Leave (User draft/pending)
  const deleteLeaveMutation = useMutation({
    mutationFn: (id: number) => leaveApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      showToast('Leave request cancelled.', 'success');
      setDeleteLeaveId(null);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to cancel leave request.'), 'error');
    }
  });

  // Add Holiday (HR)
  const addHolidayMutation = useMutation({
    mutationFn: (data: any) => holidaysApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      showToast('Holiday added successfully!', 'success');
      setShowAddHolidayModal(false);
      setHolidayName('');
      setHolidayDate('');
      setHolidayType('national');
      setHolidayDesc('');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to add holiday.'), 'error');
    }
  });

  // Delete Holiday (HR)
  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => holidaysApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      showToast('Holiday deleted successfully.', 'success');
      setDeleteHolidayId(null);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to delete holiday.'), 'error');
    }
  });

  // Add/Correct Attendance Record (HR)
  const upsertAttendanceMutation = useMutation({
    mutationFn: (data: any) => attendanceApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      showToast('Attendance record saved.', 'success');
      setAttendanceModalOpen(false);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to save attendance record.'), 'error');
    }
  });

  // Delete Attendance Record (HR)
  const deleteAttendanceMutation = useMutation({
    mutationFn: (id: number) => attendanceApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      showToast('Attendance record deleted.', 'success');
      setDeleteAttendanceRecordId(null);
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to delete record.'), 'error');
    }
  });

  // ─── Calendar Logic ─────────────────────────────────────────────────────────
  const { calendarDays, monthYearLabel } = useMemo(() => {
    const date = new Date(currentYear, currentMonth - 1, 1);
    const label = date.toLocaleDateString('default', { month: 'long', year: 'numeric' });

    const startDayOfWeek = date.getDay(); // 0 is Sunday
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();

    const days: Array<number | null> = [];
    // Pad initial empty blocks
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    // Fill days
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return { calendarDays: days, monthYearLabel: label };
  }, [currentMonth, currentYear]);

  // Log map lookup for calendar styling
  const logsMap = useMemo(() => {
    const map: Record<string, any> = {};
    logsList.forEach((log: any) => {
      if (log.date) {
        // Date can be full ISO or date string
        const dateStr = log.date.split('T')[0];
        map[dateStr] = log;
      }
    });
    return map;
  }, [logsList]);

  // Month change helpers
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Clock Actions Handler
  const handleClockIn = (e: React.FormEvent) => {
    e.preventDefault();
    clockInMutation.mutate({
      notes: clockInNotes,
      location: clockInLocation,
    });
  };

  const handleApplyLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveTypeId || !leaveStartDate || !leaveEndDate) {
      showToast('Please fill in all required fields.', 'warning');
      return;
    }
    applyLeaveMutation.mutate({
      leave_type_id: parseInt(leaveTypeId),
      start_date: leaveStartDate,
      end_date: leaveEndDate,
      reason: leaveReason,
    });
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName || !holidayDate) {
      showToast('Please fill in all required fields.', 'warning');
      return;
    }
    addHolidayMutation.mutate({
      name: holidayName,
      date: holidayDate,
      type: holidayType,
      description: holidayDesc,
    });
  };

  // Open the Add/Correct Attendance Record modal. Pass a user to lock the
  // record to their row (editing from Team Registry); omit it to let HR pick
  // any employee (backfilling a missed day from scratch).
  const openAttendanceModal = (targetUserId?: number, targetUserName?: string) => {
    setAmUserId(targetUserId ? String(targetUserId) : '');
    setAmUserName(targetUserName || '');
    setAmUserLocked(!!targetUserId);
    setAmDate(new Date().toISOString().split('T')[0]);
    setAmStatus('present');
    setAmCheckIn('');
    setAmCheckOut('');
    setAmBreak('');
    setAmNotes('');
    setAttendanceModalOpen(true);
  };

  const handleSaveAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amUserId || !amDate || !amStatus) {
      showToast('Please fill in all required fields.', 'warning');
      return;
    }
    const payload: Record<string, any> = { user_id: parseInt(amUserId), date: amDate, status: amStatus };
    if (amCheckIn) payload.check_in_at = `${amDate}T${amCheckIn}:00`;
    if (amCheckOut) payload.check_out_at = `${amDate}T${amCheckOut}:00`;
    if (amBreak !== '') payload.break_minutes = parseInt(amBreak) || 0;
    if (amNotes) payload.notes = amNotes;
    upsertAttendanceMutation.mutate(payload);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem', height: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarIcon size={24} style={{ color: 'var(--accent)' }} />
            Attendance & Leave Center
            <HelpIcon title="Attendance & Leave Center" content={{
              what: 'Daily clock-in/out tracking, leave requests, and the corporate holiday calendar.',
              why: 'Accurate attendance and leave records keep payroll and reporting honest and give HR a live view of who\'s working today.',
              when: 'Clock in when you start work each day, and clock out when you finish.',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Clock-in working hours, manage leave applications, check national calendars, and audit team presence logs.
          </p>
        </div>
        <HowToUseGuide moduleKey="attendance" title="How Attendance & Leave Works" content={ATTENDANCE_HOWTO} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', height: '48px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '1.5rem', height: '100%', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            onClick={() => setActiveTab('my_attendance')}
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              color: activeTab === 'my_attendance' ? 'var(--accent)' : 'var(--text-secondary)',
              borderStyle: 'solid',
              borderWidth: '0px 0px 2px 0px',
              borderColor: activeTab === 'my_attendance' ? 'var(--accent)' : 'transparent',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            My Attendance
          </button>

          {canViewTeam && (
            <button
              onClick={() => setActiveTab('team_registry')}
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                color: activeTab === 'team_registry' ? 'var(--accent)' : 'var(--text-secondary)',
                borderStyle: 'solid',
                borderWidth: '0px 0px 2px 0px',
                borderColor: activeTab === 'team_registry' ? 'var(--accent)' : 'transparent',
                fontWeight: 600,
                fontSize: '0.875rem',
                background: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Team Registry
            </button>
          )}

          <button
            onClick={() => setActiveTab('leave_requests')}
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              color: activeTab === 'leave_requests' ? 'var(--accent)' : 'var(--text-secondary)',
              borderStyle: 'solid',
              borderWidth: '0px 0px 2px 0px',
              borderColor: activeTab === 'leave_requests' ? 'var(--accent)' : 'transparent',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Leave Requests
          </button>

          <button
            onClick={() => setActiveTab('holidays')}
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              color: activeTab === 'holidays' ? 'var(--accent)' : 'var(--text-secondary)',
              borderStyle: 'solid',
              borderWidth: '0px 0px 2px 0px',
              borderColor: activeTab === 'holidays' ? 'var(--accent)' : 'transparent',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Holiday Calendar
          </button>
        </div>
      </div>

      {/* ─── TAB: MY ATTENDANCE ────────────────────────────────────────────────── */}
      {activeTab === 'my_attendance' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>

          {/* Left Panel: Clock actions and Stats */}
          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Clock Widget */}
            <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--accent-subtle)', borderRadius: '50%', color: 'var(--accent)', display: 'flex', border: '1px solid var(--border-subtle)' }}>
                <Clock size={32} />
              </div>

              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', margin: 0, letterSpacing: '-0.05em' }}>
                  {timerText}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, margin: '4px 0 0 0' }}>
                  Today's Working Hours
                </p>
              </div>

              {todayRecord && todayRecord.check_in_at && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', padding: '0.75rem 1rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                    <span style={{ fontWeight: 600, color: 'var(--success)' }}>Active Work Session</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Clock In Time:</span>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      {new Date(todayRecord.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Location:</span>
                    <span style={{ fontWeight: 600 }}>{todayRecord.location || 'Office'}</span>
                  </div>
                </div>
              )}

              {!todayRecord || !todayRecord.check_in_at ? (
                /* Clock In Form */
                <form onSubmit={handleClockIn} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Location</label>
                      <select
                        value={clockInLocation}
                        onChange={(e) => setClockInLocation(e.target.value)}
                        className="form-input"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
                      >
                        {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Notes (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Starting tasks, meeting client..."
                      value={clockInNotes}
                      onChange={(e) => setClockInNotes(e.target.value)}
                      className="form-input"
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
                    />
                  </div>
                  <button type="submit" disabled={clockInMutation.isPending} className="btn btn-primary" style={{ width: '100%', padding: '0.625rem' }}>
                    <Play size={16} style={{ marginRight: '0.375rem' }} /> Clock In
                  </button>
                </form>
              ) : (
                /* Clock Out Button */
                <button
                  onClick={() => setShowClockOutModal(true)}
                  disabled={clockOutMutation.isPending}
                  className="btn btn-danger"
                  style={{ width: '100%', padding: '0.625rem' }}
                >
                  <Square size={16} style={{ marginRight: '0.375rem' }} /> Clock Out / Finish Day
                </button>
              )}
            </div>

            {/* Monthly Stats */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
                {monthYearLabel} Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--success)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Present</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)' }}>{summary?.present_days || 0}</div>
                </div>
                <div style={{ background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--danger)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Absent</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--danger)' }}>{summary?.absent_days || 0}</div>
                </div>
                <div style={{ background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--info)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Leaves</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--info)' }}>{summary?.leave_days || 0}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.25rem 0 0.25rem', fontSize: '0.8125rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Average Worked Hours:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{summary?.avg_daily_hours || 0} hrs</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Calendar & Recent Logs */}
          <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Calendar Widget */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {monthYearLabel} Calendar
                </h3>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  <button onClick={handlePrevMonth} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>&larr;</button>
                  <button onClick={handleNextMonth} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>&rarr;</button>
                </div>
              </div>

              {/* Day Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>

              {/* Grid Days */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                {calendarDays.map((dayNum, idx) => {
                  if (dayNum === null) {
                    return <div key={`empty-${idx}`} style={{ aspectRatio: '1', display: 'flex' }} />;
                  }

                  const dayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const log = logsMap[dayStr];

                  let dayStyle: React.CSSProperties = {
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid transparent',
                    cursor: 'default',
                  };

                  if (log) {
                    if (log.status === 'present') {
                      dayStyle = { ...dayStyle, background: 'var(--success-subtle)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' };
                    } else if (log.status === 'partial') {
                      dayStyle = { ...dayStyle, background: 'var(--warning-subtle)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' };
                    } else if (log.status === 'leave') {
                      dayStyle = { ...dayStyle, background: 'var(--info-subtle)', color: 'var(--info)', border: '1px solid rgba(59,130,246,0.3)' };
                    } else if (log.status === 'absent') {
                      dayStyle = { ...dayStyle, background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' };
                    } else if (log.status === 'holiday') {
                      dayStyle = { ...dayStyle, background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid rgba(124,58,237,0.3)' };
                    }
                  }

                  return (
                    <div
                      key={`day-${dayNum}`}
                      style={dayStyle}
                      title={log ? `${log.status.toUpperCase()} worked: ${log.break_minutes ? `break ${log.break_minutes}m` : 'no breaks'}` : 'No records logged'}
                    >
                      {dayNum}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Logs List */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
                Logs in {monthYearLabel}
              </h3>
              {loadingLogs ? (
                <SkeletonTable rows={4} cols={6} />
              ) : logsList.length === 0 ? (
                <EmptyState title="No logs found" description="No logs registered for this month. Clock in above to create today's entry." />
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Clock In</th>
                        <th>Clock Out</th>
                        <th>Breaks</th>
                        <th>Worked</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsList.map((log: any) => (
                        <tr key={log.id}>
                          <td style={{ fontWeight: 500 }}>{formatDate(log.date)}</td>
                          <td style={{ fontFamily: 'monospace' }}>
                            {log.check_in_at ? new Date(log.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ fontFamily: 'monospace' }}>
                            {log.check_out_at ? new Date(log.check_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td>{log.break_minutes} mins</td>
                          <td>{formatWorkedMinutes(log.worked_minutes)}</td>
                          <td>
                            <span className={`badge ${
                              log.status === 'present' ? 'badge-success' :
                              log.status === 'partial' ? 'badge-warning' :
                              log.status === 'leave' ? 'badge-info' :
                              log.status === 'holiday' ? 'badge-accent' :
                              'badge-muted'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: TEAM REGISTRY (HR ONLY) ────────────────────────────────────── */}
      {activeTab === 'team_registry' && canViewTeam && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '1rem 1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              Live Team Presence Status
              <HelpIcon text="Shows every active employee's clock-in/out status for today. Updates whenever anyone clocks in, clocks out, or HR corrects a record." />
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-accent">
                {teamRegistry.filter((t) => t.attendance?.status === 'present').length} active now
              </span>
              {canManageAttendance && (
                <button onClick={() => openAttendanceModal()} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Plus size={14} /> Add / Correct Record
                </button>
              )}
            </div>
          </div>

          {teamRegistry.length === 0 ? (
            <EmptyState title="No employees found" description="No employee records loaded." />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role(s)</th>
                    <th>Today's Clock In</th>
                    <th>Today's Clock Out</th>
                    <th>Current Status</th>
                    {canManageAttendance && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {teamRegistry.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td>{t.roles?.join(', ') || 'Employee'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.attendance?.check_in_at || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.attendance?.check_out_at || '—'}</td>
                      <td>
                        <span className={`badge ${
                          t.attendance?.status === 'present' ? 'badge-success' :
                          t.attendance?.status === 'partial' ? 'badge-warning' :
                          t.attendance?.status === 'leave' ? 'badge-info' :
                          'badge-muted'
                        }`}>
                          {t.attendance?.status || 'absent'}
                        </span>
                      </td>
                      {canManageAttendance && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.375rem' }}>
                            <button
                              onClick={() => openAttendanceModal(t.id, t.name)}
                              className="btn btn-ghost btn-sm btn-icon"
                              title="Add / correct today's record"
                            >
                              <Pencil size={14} />
                            </button>
                            {t.attendance?.id && (
                              <button
                                onClick={() => setDeleteAttendanceRecordId(t.attendance!.id)}
                                className="btn btn-ghost btn-sm btn-icon"
                                title="Delete today's record"
                                style={{ color: 'var(--danger)' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: LEAVE REQUESTS ──────────────────────────────────────────────── */}
      {activeTab === 'leave_requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowApplyLeaveModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={16} /> Request Leave
            </button>
          </div>

          {/* Pending HR Approvals Section (HR only) */}
          {canApproveLeave && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
                Pending Approval Requests
              </h3>

              {leaveRequestsList.filter((req) => req.status === 'pending').length === 0 ? (
                <EmptyState title="No pending requests" description="No pending approval requests." />
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Leave Type</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>Days</th>
                        <th>Reason</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveRequestsList.filter((req) => req.status === 'pending').map((req) => (
                        <tr key={req.id}>
                          <td style={{ fontWeight: 600 }}>{req.user?.name}</td>
                          <td>
                            <span style={{ color: req.leave_type?.color || 'var(--text-primary)', fontWeight: 600 }}>
                              {req.leave_type?.name}
                            </span>
                          </td>
                          <td>{formatDate(req.start_date)}</td>
                          <td>{formatDate(req.end_date)}</td>
                          <td>{req.days_count}</td>
                          <td style={{ maxWidth: '200px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={req.reason || undefined}>
                            {req.reason || '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                              <button
                                onClick={() => approveLeaveMutation.mutate(req.id)}
                                disabled={approveLeaveMutation.isPending}
                                className="btn btn-success btn-sm btn-icon"
                                title="Approve"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setRejectLeaveId(req.id)}
                                className="btn btn-danger btn-sm btn-icon"
                                title="Reject"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* User Requests History Section */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
              Leave History & Status
            </h3>

            {leaveRequestsList.length === 0 ? (
              <EmptyState
                title="No leave requests yet"
                description="You haven't filed any leave requests."
                action={<button onClick={() => setShowApplyLeaveModal(true)} className="btn btn-primary btn-sm">Request Leave</button>}
              />
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {canViewAllLeave && <th>Employee</th>}
                      <th>Leave Type</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th>Approved/Rejected By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequestsList.map((req) => (
                      <tr key={req.id}>
                        {canViewAllLeave && <td style={{ fontWeight: 600 }}>{req.user?.name}</td>}
                        <td>
                          <span style={{ color: req.leave_type?.color || 'var(--text-primary)', fontWeight: 600 }}>
                            {req.leave_type?.name}
                          </span>
                        </td>
                        <td>{formatDate(req.start_date)}</td>
                        <td>{formatDate(req.end_date)}</td>
                        <td>{req.days_count}</td>
                        <td>
                          <span className={`badge ${
                            req.status === 'approved' ? 'badge-success' :
                            req.status === 'rejected' ? 'badge-danger' :
                            'badge-warning'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td>{req.approver?.name || '—'}</td>
                        <td>
                          {req.status === 'pending' && req.user_id === user?.id && (
                            <button
                              onClick={() => setDeleteLeaveId(req.id)}
                              className="btn btn-ghost btn-sm btn-icon"
                              title="Cancel Request"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: HOLIDAY CALENDAR ────────────────────────────────────────────── */}
      {activeTab === 'holidays' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Year:</label>
              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(parseInt(e.target.value))}
                className="form-input"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.875rem' }}
              >
                {holidayYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {canManageHolidays && (
              <button onClick={() => setShowAddHolidayModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Plus size={16} /> Add Holiday
              </button>
            )}
          </div>

          <div className="card" style={{ padding: holidaysList.length === 0 ? 0 : '1.25rem' }}>
            {holidaysList.length === 0 ? (
              <EmptyState
                title="No holidays registered"
                description={`No holidays registered for ${currentYear} yet.`}
                action={canManageHolidays ? (
                  <button onClick={() => setShowAddHolidayModal(true)} className="btn btn-primary btn-sm">Add Holiday</button>
                ) : undefined}
              />
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Holiday Name</th>
                      <th>Type</th>
                      <th>Description</th>
                      {canManageHolidays && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {holidaysList.map((hol) => (
                      <tr key={hol.id}>
                        <td style={{ fontWeight: 600 }}>{formatDate(hol.date)}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{hol.name}</td>
                        <td>
                          <span className={`badge ${
                            hol.type === 'national' ? 'badge-accent' :
                            hol.type === 'regional' ? 'badge-info' :
                            'badge-muted'
                          }`}>
                            {hol.type}
                          </span>
                        </td>
                        <td>{hol.description || '—'}</td>
                        {canManageHolidays && (
                          <td>
                            <button
                              onClick={() => setDeleteHolidayId(hol.id)}
                              className="btn btn-ghost btn-sm btn-icon"
                              title="Delete Holiday"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODALS & DRAWERS ─────────────────────────────────────────────────── */}

      {/* Clock Out Break minutes modal */}
      {showClockOutModal && (
        <InputModal
          title="Finish Work Session"
          message="Specify total break minutes taken today (minutes will be excluded from worked hours):"
          placeholder="Break duration in minutes (e.g. 45)"
          defaultValue="0"
          confirmLabel="Clock Out"
          onConfirm={(val) => {
            const mins = parseInt(val) || 0;
            clockOutMutation.mutate({ break_minutes: mins });
            setShowClockOutModal(false);
          }}
          onCancel={() => setShowClockOutModal(false)}
        />
      )}

      {/* Reject Leave Request (HR) */}
      {rejectLeaveId !== null && (
        <InputModal
          title="Reject Leave Request"
          message="Provide a brief reason for rejecting this leave request:"
          placeholder="Rejection reason..."
          defaultValue=""
          confirmLabel="Reject Request"
          onConfirm={(val) => {
            rejectLeaveMutation.mutate({ id: rejectLeaveId, reason: val });
          }}
          onCancel={() => setRejectLeaveId(null)}
        />
      )}

      {/* Cancel Leave Request Confirmation */}
      {deleteLeaveId !== null && (
        <ConfirmModal
          title="Cancel Leave Request"
          message="Are you sure you want to cancel and delete this pending leave request? This action cannot be undone."
          confirmLabel="Cancel Request"
          danger={true}
          onConfirm={() => deleteLeaveMutation.mutate(deleteLeaveId)}
          onCancel={() => setDeleteLeaveId(null)}
        />
      )}

      {/* Delete Holiday Confirmation (HR) */}
      {deleteHolidayId !== null && (
        <ConfirmModal
          title="Delete Holiday"
          message="Are you sure you want to delete this holiday from the corporate calendar?"
          confirmLabel="Delete Holiday"
          danger={true}
          onConfirm={() => deleteHolidayMutation.mutate(deleteHolidayId)}
          onCancel={() => setDeleteHolidayId(null)}
        />
      )}

      {/* Delete Attendance Record Confirmation (HR) */}
      {deleteAttendanceRecordId !== null && (
        <ConfirmModal
          title="Delete Attendance Record"
          message="Are you sure you want to delete this attendance record? This cannot be undone."
          confirmLabel="Delete Record"
          danger={true}
          onConfirm={() => deleteAttendanceMutation.mutate(deleteAttendanceRecordId)}
          onCancel={() => setDeleteAttendanceRecordId(null)}
        />
      )}

      {/* Apply Leave Modal */}
      {showApplyLeaveModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Apply for Leave
            </h3>

            <form onSubmit={handleApplyLeave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Leave Type *</label>
                <select
                  required
                  value={leaveTypeId}
                  onChange={(e) => setLeaveTypeId(e.target.value)}
                  className="form-input"
                >
                  <option value="">Select Leave Type</option>
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.is_paid ? 'Paid' : 'Unpaid'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">End Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reason / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Provide details about your leave application..."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="form-input"
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowApplyLeaveModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={applyLeaveMutation.isPending} className="btn btn-primary">
                  {applyLeaveMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal (HR) */}
      {showAddHolidayModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Add Corporate Calendar Holiday
            </h3>

            <form onSubmit={handleAddHoliday} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Holiday Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    required
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Type *</label>
                  <select
                    value={holidayType}
                    onChange={(e) => setHolidayType(e.target.value)}
                    className="form-input"
                  >
                    <option value="national">National</option>
                    <option value="regional">Regional</option>
                    <option value="optional">Optional</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional details..."
                  value={holidayDesc}
                  onChange={(e) => setHolidayDesc(e.target.value)}
                  className="form-input"
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddHolidayModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={addHolidayMutation.isPending} className="btn btn-primary">
                  {addHolidayMutation.isPending ? 'Adding...' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Correct Attendance Record Modal (HR) */}
      {attendanceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {amUserLocked ? `Correct Record — ${amUserName}` : 'Add / Correct Attendance Record'}
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
              Use this to fix a wrong clock time or backfill a day an employee forgot to clock in. Leave a time field blank to keep it unchanged.
            </p>

            <form onSubmit={handleSaveAttendance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {!amUserLocked && (
                <div className="form-group">
                  <label className="form-label">Employee *</label>
                  <select
                    required
                    value={amUserId}
                    onChange={(e) => setAmUserId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select Employee</option>
                    {teamRegistry.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    required
                    value={amDate}
                    onChange={(e) => setAmDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Status *</label>
                  <select
                    required
                    value={amStatus}
                    onChange={(e) => setAmStatus(e.target.value as AttendanceStatus)}
                    className="form-input"
                  >
                    <option value="present">Present</option>
                    <option value="partial">Partial</option>
                    <option value="absent">Absent</option>
                    <option value="leave">Leave</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Clock In (optional)</label>
                  <input
                    type="time"
                    value={amCheckIn}
                    onChange={(e) => setAmCheckIn(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Clock Out (optional)</label>
                  <input
                    type="time"
                    value={amCheckOut}
                    onChange={(e) => setAmCheckOut(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Break (mins)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={amBreak}
                    onChange={(e) => setAmBreak(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="Reason for the correction..."
                  value={amNotes}
                  onChange={(e) => setAmNotes(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setAttendanceModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={upsertAttendanceMutation.isPending} className="btn btn-primary">
                  {upsertAttendanceMutation.isPending ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
