<?php
declare(strict_types=1);
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class LeaveController extends Controller
{
    public function listTypes(): JsonResponse
    {
        return response()->json(['data' => LeaveType::where('active', true)->get()]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $canViewAll = Gate::allows('viewAll', LeaveRequest::class);
        $query = LeaveRequest::with(['user', 'leaveType', 'approver']);
        if (!$canViewAll) $query->where('user_id', $user->id);
        if ($request->status) $query->where('status', $request->status);
        if ($request->user_id && $canViewAll) $query->where('user_id', $request->user_id);
        return response()->json($query->orderBy('created_at', 'desc')->paginate(15));
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', LeaveRequest::class);

        $validated = $request->validate([
            'leave_type_id' => ['required', 'exists:leave_types,id'],
            'start_date' => ['required', 'date', 'after_or_equal:today'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);
        $days = Carbon::parse($validated['start_date'])->diffInDays(Carbon::parse($validated['end_date'])) + 1;
        $request_data = $validated + ['user_id' => $request->user()->id, 'days_count' => $days, 'status' => 'pending'];
        $leave = LeaveRequest::create($request_data);
        return response()->json(['data' => $leave->load(['leaveType', 'user'])], 201);
    }

    public function show(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        Gate::authorize('view', $leaveRequest);
        return response()->json(['data' => $leaveRequest->load(['user', 'leaveType', 'approver'])]);
    }

    public function update(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        if (!Gate::allows('update', $leaveRequest)) {
            return response()->json(['message' => 'Cannot edit this request.'], 403);
        }
        $validated = $request->validate([
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['sometimes', 'date', 'after_or_equal:start_date'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);
        if (isset($validated['start_date']) && isset($validated['end_date'])) {
            $validated['days_count'] = Carbon::parse($validated['start_date'])->diffInDays(Carbon::parse($validated['end_date'])) + 1;
        }
        $leaveRequest->update($validated);
        return response()->json(['data' => $leaveRequest->fresh()->load(['leaveType', 'user'])]);
    }

    public function destroy(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        if (!Gate::allows('delete', $leaveRequest)) {
            return response()->json(['message' => 'Cannot delete this request.'], 403);
        }
        $leaveRequest->delete();
        return response()->json(['message' => 'Leave request deleted.']);
    }

    public function approve(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        Gate::authorize('approve', LeaveRequest::class);
        $leaveRequest->update(['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()]);
        return response()->json(['data' => $leaveRequest->fresh()->load(['leaveType', 'user', 'approver'])]);
    }

    public function reject(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        Gate::authorize('approve', LeaveRequest::class);
        $validated = $request->validate(['rejection_reason' => ['nullable', 'string', 'max:500']]);
        $leaveRequest->update(['status' => 'rejected', 'approved_by' => $request->user()->id, 'rejection_reason' => $validated['rejection_reason'] ?? null]);
        return response()->json(['data' => $leaveRequest->fresh()->load(['leaveType', 'user'])]);
    }

    public function listHolidays(Request $request): JsonResponse
    {
        $year = $request->year ?? now()->year;
        return response()->json(['data' => Holiday::whereYear('date', $year)->orderBy('date')->get()]);
    }

    public function storeHoliday(Request $request): JsonResponse
    {
        Gate::authorize('manage', Holiday::class);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'date' => ['required', 'date', 'unique:holidays,date'],
            'type' => ['nullable', 'in:national,regional,optional'],
            'description' => ['nullable', 'string'],
        ]);
        return response()->json(['data' => Holiday::create($validated)], 201);
    }

    public function updateHoliday(Request $request, Holiday $holiday): JsonResponse
    {
        Gate::authorize('manage', Holiday::class);
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'date' => ['sometimes', 'date'],
            'type' => ['nullable', 'in:national,regional,optional'],
            'description' => ['nullable', 'string'],
        ]);
        $holiday->update($validated);
        return response()->json(['data' => $holiday->fresh()]);
    }

    public function destroyHoliday(Request $request, Holiday $holiday): JsonResponse
    {
        Gate::authorize('manage', Holiday::class);
        $holiday->delete();
        return response()->json(['message' => 'Holiday deleted.']);
    }
}
