<?php
declare(strict_types=1);
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class AttendanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $canViewAll = Gate::allows('viewTeam', AttendanceRecord::class);

        $query = AttendanceRecord::query()->with('user');

        if (!$canViewAll) {
            $query->where('user_id', $user->id);
        } elseif ($request->user_id) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->from) $query->whereDate('date', '>=', $request->from);
        if ($request->to) $query->whereDate('date', '<=', $request->to);
        if ($request->status) $query->where('status', $request->status);
        if ($request->month && $request->year) {
            $query->whereMonth('date', $request->month)->whereYear('date', $request->year);
        } elseif (!$request->from && !$request->to) {
            // Default: current month
            $query->whereMonth('date', now()->month)->whereYear('date', now()->year);
        }

        $records = $query->orderBy('date', 'desc')->paginate($request->per_page ?? 31);
        return response()->json($records);
    }

    public function today(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::today()->toDateString();
        $record = AttendanceRecord::where('user_id', $user->id)->whereDate('date', $today)->first();
        return response()->json(['data' => $record]);
    }

    public function team(Request $request): JsonResponse
    {
        Gate::authorize('viewTeam', AttendanceRecord::class);

        $today = Carbon::today()->toDateString();
        $records = AttendanceRecord::with('user')->whereDate('date', $today)->get();

        // Get all active non-portal users
        $users = \App\Models\User::active()->nonPortal()->with('roles')->get();

        $teamData = $users->map(function ($u) use ($records) {
            $record = $records->firstWhere('user_id', $u->id);
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'avatar_url' => $u->avatar_url,
                'roles' => $u->roles->pluck('name'),
                'attendance' => $record ? [
                    'id' => $record->id,
                    'status' => $record->status,
                    'check_in_at' => $record->check_in_at?->format('H:i A'),
                    'check_out_at' => $record->check_out_at?->format('H:i A'),
                    'worked_minutes' => $record->worked_minutes,
                ] : null,
            ];
        });
        return response()->json(['data' => $teamData]);
    }

    public function summary(Request $request): JsonResponse
    {
        $userId = $request->user_id ?? $request->user()->id;
        if ((int)$userId !== $request->user()->id && !Gate::allows('viewTeam', AttendanceRecord::class)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        $month = $request->month ?? now()->month;
        $year = $request->year ?? now()->year;

        $records = AttendanceRecord::where('user_id', $userId)
            ->whereMonth('date', $month)->whereYear('date', $year)->get();

        $presentDays = $records->whereIn('status', ['present', 'partial'])->count();
        $absentDays = $records->where('status', 'absent')->count();
        $leaveDays = $records->where('status', 'leave')->count();
        $totalMinutes = $records->sum('worked_minutes');
        $avgMinutes = $presentDays > 0 ? round($totalMinutes / $presentDays) : 0;

        return response()->json([
            'data' => [
                'present_days' => $presentDays,
                'absent_days' => $absentDays,
                'leave_days' => $leaveDays,
                'total_worked_minutes' => $totalMinutes,
                'avg_daily_minutes' => $avgMinutes,
                'avg_daily_hours' => round($avgMinutes / 60, 1),
            ]
        ]);
    }

    public function clockIn(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::today()->toDateString();

        $record = AttendanceRecord::where('user_id', $user->id)->whereDate('date', $today)->first();
        if ($record && $record->check_in_at) {
            return response()->json(['message' => 'Already clocked in today.'], 422);
        }

        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:500'],
            'location' => ['nullable', 'string', 'max:100'],
        ]);

        if (!$record) {
            $record = new AttendanceRecord([
                'user_id' => $user->id,
                'date' => $today,
            ]);
        }

        $record->fill([
            'check_in_at' => Carbon::now(),
            'status' => 'present',
            'notes' => $validated['notes'] ?? null,
            'location' => $validated['location'] ?? null,
            'ip_address' => $request->ip(),
        ]);
        $record->save();

        return response()->json(['message' => 'Clocked in successfully.', 'data' => $record]);
    }

    public function clockOut(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::today()->toDateString();

        $record = AttendanceRecord::where('user_id', $user->id)->whereDate('date', $today)->first();
        if (!$record || !$record->check_in_at) {
            return response()->json(['message' => 'You have not clocked in today.'], 422);
        }
        if ($record->check_out_at) {
            return response()->json(['message' => 'Already clocked out.'], 422);
        }

        $validated = $request->validate([
            'break_minutes' => ['nullable', 'integer', 'min:0', 'max:480'],
        ]);

        $record->update([
            'check_out_at' => Carbon::now(),
            'break_minutes' => $validated['break_minutes'] ?? 0,
        ]);

        // Auto-downgrade to "partial" if worked < 5hrs — but only when the status is
        // still the 'present' this endpoint itself set on clock-in. If HR manually set a
        // different status (e.g. 'leave') earlier the same day, don't clobber it.
        $record->refresh();
        if ($record->status === 'present' && $record->worked_minutes < 300) {
            $record->update(['status' => 'partial']);
        }

        return response()->json(['message' => 'Clocked out successfully.', 'data' => $record->fresh()]);
    }

    /**
     * HR: create or backfill an attendance record for any user/date
     * (e.g. an employee forgot to clock in on a past day).
     */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', AttendanceRecord::class);

        $validated = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'date' => ['required', 'date'],
            'check_in_at' => ['nullable', 'date'],
            'check_out_at' => ['nullable', 'date'],
            'break_minutes' => ['nullable', 'integer', 'min:0'],
            'status' => ['required', 'in:present,partial,absent,leave,holiday'],
            'notes' => ['nullable', 'string', 'max:500'],
            'location' => ['nullable', 'string', 'max:100'],
        ]);

        $record = AttendanceRecord::updateOrCreate(
            ['user_id' => $validated['user_id'], 'date' => $validated['date']],
            collect($validated)->except(['user_id', 'date'])->toArray()
        );

        return response()->json(['message' => 'Attendance record saved.', 'data' => $record->fresh('user')], 201);
    }

    public function update(Request $request, AttendanceRecord $record): JsonResponse
    {
        Gate::authorize('update', $record);

        $validated = $request->validate([
            'check_in_at' => ['nullable', 'date'],
            'check_out_at' => ['nullable', 'date'],
            'break_minutes' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'in:present,partial,absent,leave,holiday'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $record->update($validated);
        return response()->json(['data' => $record->fresh()]);
    }

    public function destroy(Request $request, AttendanceRecord $record): JsonResponse
    {
        Gate::authorize('delete', $record);

        $record->delete();
        return response()->json(['message' => 'Record deleted.']);
    }
}
