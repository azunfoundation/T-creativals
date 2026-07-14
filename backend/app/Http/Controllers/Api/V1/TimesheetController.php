<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\TimesheetResource;
use App\Models\Project;
use App\Models\Timesheet;
use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use App\Mail\TimesheetSubmittedMail;

class TimesheetController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Timesheet::class);

        $user = $request->user();
        $query = Timesheet::query()->with(['user', 'task', 'project', 'approver']);

        // Default to showing only own timesheets unless user has timesheets.view_all permission
        if ($user->hasRole('founder') || $user->hasPermissionTo('timesheets.view_all')) {
            if ($request->has('user_id')) {
                $query->where('user_id', $request->input('user_id'));
            }
        } else {
            $query->where('user_id', $user->id);
        }

        if ($request->filled('task_id')) {
            $query->where('task_id', $request->input('task_id'));
        }

        // Week view by default (current week) — unless a date range, a specific
        // task's full history, or `all=1` (e.g. the approvals queue, which must
        // never miss entries just because they were logged in a prior week) is
        // explicitly requested.
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        if (!$startDate && !$endDate && !$request->boolean('all') && !$request->filled('task_id')) {
            $startDate = now()->startOfWeek()->toDateString();
            $endDate = now()->endOfWeek()->toDateString();
        }

        if ($startDate) {
            $query->where('date', '>=', $startDate);
        }
        if ($endDate) {
            $query->where('date', '<=', $endDate);
        }

        $timesheets = $query->orderBy('date', 'desc')->get();
        return TimesheetResource::collection($timesheets)->response();
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Timesheet::class);

        $validated = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'date' => 'required|date',
            'hours_logged' => 'required|numeric|min:0.01|max:24',
            'description' => 'nullable|string',
            'is_billable' => 'nullable|boolean',
        ]);

        // If task_id is provided, enforce uniqueness on (user_id, task_id, date)
        if (!empty($validated['task_id'])) {
            $exists = Timesheet::where('user_id', $request->user()->id)
                ->where('task_id', $validated['task_id'])
                ->where('date', $validated['date'])
                ->exists();
            if ($exists) {
                return response()->json([
                    'message' => 'You have already logged time for this task on this date.',
                    'errors' => ['task_id' => ['Duplicate entry for this task on this date.']]
                ], 422);
            }
        }

        $timesheet = Timesheet::create([
            'user_id' => $request->user()->id,
            'project_id' => $validated['project_id'],
            'task_id' => $validated['task_id'] ?? null,
            'date' => $validated['date'],
            'hours_logged' => $validated['hours_logged'],
            'description' => $validated['description'] ?? null,
            'is_billable' => $validated['is_billable'] ?? true,
            'status' => 'draft',
        ]);

        $timesheet->load(['user', 'task', 'project']);
        return (new TimesheetResource($timesheet))->response()->setStatusCode(201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Timesheet $timesheet): JsonResponse
    {
        Gate::authorize('view', $timesheet);

        $timesheet->load(['user', 'task', 'project', 'approvals.approver']);
        return (new TimesheetResource($timesheet))->response();
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Timesheet $timesheet): JsonResponse
    {
        Gate::authorize('update', $timesheet);

        $validated = $request->validate([
            'project_id' => 'sometimes|required|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'date' => 'sometimes|required|date',
            'hours_logged' => 'sometimes|required|numeric|min:0.01|max:24',
            'description' => 'nullable|string',
            'is_billable' => 'nullable|boolean',
        ]);

        $newTaskId = array_key_exists('task_id', $validated) ? $validated['task_id'] : $timesheet->task_id;
        $newDate = array_key_exists('date', $validated) ? $validated['date'] : $timesheet->date->toDateString();

        if ($newTaskId) {
            $exists = Timesheet::where('user_id', $timesheet->user_id)
                ->where('task_id', $newTaskId)
                ->where('date', $newDate)
                ->where('id', '!=', $timesheet->id)
                ->exists();
            if ($exists) {
                return response()->json([
                    'message' => 'You have already logged time for this task on this date.',
                    'errors' => ['task_id' => ['Duplicate entry for this task on this date.']]
                ], 422);
            }
        }

        $timesheet->update($validated);
        $timesheet->load(['user', 'task', 'project']);

        return (new TimesheetResource($timesheet))->response();
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Timesheet $timesheet): JsonResponse
    {
        Gate::authorize('delete', $timesheet);

        $timesheet->delete();
        return response()->json(['message' => 'Timesheet entry deleted successfully']);
    }

    /**
     * Submit a timesheet.
     */
    public function submit(Timesheet $timesheet): JsonResponse
    {
        if ($timesheet->user_id !== auth()->id() || $timesheet->status !== 'draft') {
            return response()->json(['message' => 'Only own draft timesheets can be submitted.'], 403);
        }

        DB::transaction(function () use ($timesheet) {
            $timesheet->update(['status' => 'submitted']);
            $timesheet->approvals()->create([
                'approver_id' => null,
                'action' => 'submitted',
                'notes' => 'Submitted for approval',
            ]);
        });

        $timesheet->load(['user', 'task', 'project']);

        $approver = null;
        if ($timesheet->user) {
            $approver = $timesheet->user->managers()->wherePivot('is_primary', true)->first() 
                ?? $timesheet->user->managers()->first();
        }
        if (!$approver && $timesheet->project) {
            $pm = $timesheet->project->members()->where('role', 'manager')->first()
                ?? User::where('email', 'founder@creativals.com')->first();
            if ($pm) {
                $approver = $pm;
            }
        }
        if (!$approver) {
            $approver = User::where('email', 'founder@creativals.com')->first();
        }

        if ($approver) {
            \App\Services\NotificationService::alert('timesheet_submitted', [
                'user_id' => $approver->id,
                'triggered_by' => $timesheet->user_id,
                'type' => 'approval_requested',
                'title' => 'Timesheet Submitted',
                'body' => ($timesheet->user?->name ?? 'A team member') . " submitted a timesheet for approval ({$timesheet->hours_logged} hours).",
                'action_url' => "/timesheets/approvals",
                'metadata' => ['timesheet_id' => $timesheet->id],
            ]);

            if ($approver->email) {
                $pref = NotificationPreference::where('user_id', $approver->id)
                    ->where('event_type', 'timesheet_submitted')
                    ->first();
                if ($pref && $pref->email) {
                    try {
                        Mail::to($approver->email)->send(new TimesheetSubmittedMail($timesheet));
                    } catch (\Throwable $e) {
                        // Ignore mail failures
                    }
                }
            }
        }

        return (new TimesheetResource($timesheet))->response();
    }

    /**
     * Approve a timesheet.
     */
    public function approve(Request $request, Timesheet $timesheet): JsonResponse
    {
        Gate::authorize('approve', Timesheet::class);

        if ($timesheet->status !== 'submitted') {
            return response()->json(['message' => 'Only submitted timesheets can be approved.'], 400);
        }

        $validated = $request->validate([
            'notes' => 'nullable|string',
        ]);

        DB::transaction(function () use ($timesheet, $request, $validated) {
            $timesheet->update([
                'status' => 'approved',
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
            ]);
            $timesheet->approvals()->create([
                'approver_id' => $request->user()->id,
                'action' => 'approved',
                'notes' => $validated['notes'] ?? 'Approved',
            ]);
        });

        $timesheet->load(['user', 'task', 'project']);

        if ($timesheet->user_id) {
            \App\Services\NotificationService::alert('timesheet_approved', [
                'user_id' => $timesheet->user_id,
                'triggered_by' => $request->user()->id,
                'type' => 'timesheet_approved',
                'title' => 'Timesheet Approved',
                'body' => "Your timesheet for {$timesheet->hours_logged} hours has been approved.",
                'action_url' => "/timesheets",
                'metadata' => ['timesheet_id' => $timesheet->id],
            ]);
        }

        return (new TimesheetResource($timesheet))->response();
    }

    /**
     * Reject a timesheet.
     */
    public function reject(Request $request, Timesheet $timesheet): JsonResponse
    {
        Gate::authorize('approve', Timesheet::class);

        if ($timesheet->status !== 'submitted') {
            return response()->json(['message' => 'Only submitted timesheets can be rejected.'], 400);
        }

        $validated = $request->validate([
            'notes' => 'required|string',
        ]);

        DB::transaction(function () use ($timesheet, $request, $validated) {
            $timesheet->update([
                'status' => 'rejected',
            ]);
            $timesheet->approvals()->create([
                'approver_id' => $request->user()->id,
                'action' => 'rejected',
                'notes' => $validated['notes'],
            ]);
        });

        $timesheet->load(['user', 'task', 'project']);

        if ($timesheet->user_id) {
            \App\Services\NotificationService::alert('timesheet_rejected', [
                'user_id' => $timesheet->user_id,
                'triggered_by' => $request->user()->id,
                'type' => 'timesheet_rejected',
                'title' => 'Timesheet Rejected',
                'body' => "Your timesheet for {$timesheet->hours_logged} hours has been rejected. Reason: {$validated['notes']}",
                'action_url' => "/timesheets",
                'metadata' => ['timesheet_id' => $timesheet->id],
            ]);
        }

        return (new TimesheetResource($timesheet))->response();
    }

    /**
     * View pending timesheets.
     */
    public function pending(Request $request): JsonResponse
    {
        Gate::authorize('pending', Timesheet::class);

        $timesheets = Timesheet::where('status', 'submitted')
            ->with(['user', 'task', 'project'])
            ->orderBy('date', 'desc')
            ->get();

        return TimesheetResource::collection($timesheets)->response();
    }

    /**
     * List timesheets for a specific project.
     */
    public function projectTimesheets(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        $timesheets = $project->timesheets()
            ->with(['user', 'task', 'project'])
            ->orderBy('date', 'desc')
            ->get();

        return TimesheetResource::collection($timesheets)->response();
    }
}
