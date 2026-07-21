<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\TaskResource;
use App\Models\Project;
use App\Models\Task;
use App\Models\Timesheet;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use App\Mail\TaskAssignedMail;

class TaskController extends Controller
{
    /**
     * Display a listing of tasks.
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Task::class);

        $user = $request->user();
        $query = Task::query()->with(['project', 'assignee', 'milestone']);

        if ($user->hasRole('founder') || $user->hasRole('director') || $user->hasRole('admin') || $user->hasPermissionTo('tasks.view_all')) {
            // Founder, Director, Admin, or users with tasks.view_all permission can see all tasks across the company
        } else {
            // Filter tasks by assignment, creation, project membership, or department management
            $query->where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                  ->orWhere('created_by', $user->id)
                  ->orWhereHas('project', function ($pq) use ($user) {
                      $pq->where('manager_id', $user->id)
                        ->orWhereHas('members', function ($mq) use ($user) {
                            $mq->where('user_id', $user->id);
                        });
                  });

                if ($user->hasRole('department_head')) {
                    $deptIds = $user->departments()->pluck('departments.id')->toArray();
                    if (!empty($deptIds)) {
                        $q->orWhereHas('assignee.departments', function ($dq) use ($deptIds) {
                            $dq->whereIn('departments.id', $deptIds);
                        });
                    }
                }
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->input('priority'));
        }
        if ($request->filled('project_id')) {
            $query->where('project_id', $request->input('project_id'));
        }
        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', $request->input('assigned_to'));
        }
        if ($request->filled('parent_task_id')) {
            $query->where('parent_task_id', $request->input('parent_task_id'));
        }
        if ($request->filled('department_id')) {
            $query->whereHas('assignee.departments', function ($dq) use ($request) {
                $dq->where('departments.id', $request->input('department_id'));
            });
        }
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($sq) use ($search) {
                $sq->where('title', 'like', "%{$search}%")
                   ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $tasks = $query->paginate((int) $request->input('per_page', 250));
        return TaskResource::collection($tasks)->response();
    }

    /**
     * Store a newly created task.
     */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Task::class);

        $validated = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'milestone_id' => 'nullable|exists:milestones,id',
            'parent_task_id' => 'nullable|exists:tasks,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'assigned_to' => 'nullable|exists:users,id',
            'status' => 'nullable|string|in:todo,in_progress,review,blocked,done,cancelled',
            'priority' => 'nullable|string|in:low,medium,high,urgent',
            'due_date' => 'nullable|date',
            'estimated_hours' => 'nullable|numeric|min:0',
            'completion_percentage' => 'nullable|integer|min:0|max:100',
            'sort_order' => 'nullable|integer',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
        ]);

        $validated['created_by'] = $request->user()->id;

        $task = Task::create($validated);
        $task->load(['project', 'assignee', 'milestone']);

        if ($task->assigned_to && $task->assignee) {
            \App\Services\NotificationService::alert('task_assigned', [
                'user_id' => $task->assigned_to,
                'triggered_by' => $request->user()->id,
                'type' => 'task_assigned',
                'title' => 'New Task Assigned',
                'body' => "You have been assigned to task: {$task->title}.",
                'action_url' => "/tasks",
                'metadata' => ['task_id' => $task->id],
            ]);

            $pref = NotificationPreference::where('user_id', $task->assigned_to)
                ->where('event_type', 'task_assigned')
                ->first();
            if ($pref && $pref->email && $task->assignee->email) {
                try {
                    Mail::to($task->assignee->email)->send(new TaskAssignedMail($task));
                } catch (\Throwable $e) {
                    // Ignore mail errors
                }
            }
        }

        return (new TaskResource($task))->response()->setStatusCode(201);
    }

    /**
     * Display the specified task.
     */
    public function show(Task $task): JsonResponse
    {
        Gate::authorize('view', $task);

        $task->load(['project', 'assignee', 'milestone']);

        return (new TaskResource($task))->response();
    }

    /**
     * Update the specified task.
     */
    public function update(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        $user = $request->user();

        if ($user->hasRole('founder') || $user->hasPermissionTo('tasks.edit')) {
            $validated = $request->validate([
                'project_id' => 'sometimes|required|exists:projects,id',
                'milestone_id' => 'nullable|exists:milestones,id',
                'parent_task_id' => 'nullable|exists:tasks,id',
                'title' => 'sometimes|required|string|max:255',
                'description' => 'nullable|string',
                'assigned_to' => 'nullable|exists:users,id',
                'status' => 'nullable|string|in:todo,in_progress,review,blocked,done,cancelled',
                'priority' => 'nullable|string|in:low,medium,high,urgent',
                'due_date' => 'nullable|date',
                'estimated_hours' => 'nullable|numeric|min:0',
                'completion_percentage' => 'nullable|integer|min:0|max:100',
                'sort_order' => 'nullable|integer',
                'tags' => 'nullable|array',
                'tags.*' => 'string|max:50',
            ]);
        } else {
            // Assigned user can only update status/completion
            $validated = $request->validate([
                'status' => 'nullable|string|in:todo,in_progress,review,blocked,done,cancelled',
                'completion_percentage' => 'nullable|integer|min:0|max:100',
            ]);
            $validated = collect($validated)->only(['status', 'completion_percentage'])->toArray();
        }

        $originalAssigneeId = $task->getOriginal('assigned_to');
        $task->update($validated);
        $task->load(['project', 'assignee', 'milestone']);

        if ($task->assigned_to && $task->assigned_to !== $originalAssigneeId && $task->assignee) {
            \App\Services\NotificationService::alert('task_assigned', [
                'user_id' => $task->assigned_to,
                'triggered_by' => $request->user()->id,
                'type' => 'task_assigned',
                'title' => 'New Task Assigned',
                'body' => "You have been assigned to task: {$task->title}.",
                'action_url' => "/tasks",
                'metadata' => ['task_id' => $task->id],
            ]);

            $pref = NotificationPreference::where('user_id', $task->assigned_to)
                ->where('event_type', 'task_assigned')
                ->first();
            if ($pref && $pref->email && $task->assignee->email) {
                try {
                    Mail::to($task->assignee->email)->send(new TaskAssignedMail($task));
                } catch (\Throwable $e) {
                    // Ignore mail errors
                }
            }
        }

        return (new TaskResource($task))->response();
    }

    /**
     * Remove the specified task.
     */
    public function destroy(Task $task): JsonResponse
    {
        Gate::authorize('delete', $task);

        $task->delete();

        return response()->json(['message' => 'Task deleted successfully']);
    }

    /**
     * Update status only (PATCH).
     */
    public function updateStatus(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        $validated = $request->validate([
            'status' => 'required|string|in:todo,in_progress,review,blocked,done,cancelled',
        ]);

        $oldStatus = $task->status;
        $task->update($validated);
        $task->load(['project', 'assignee', 'milestone']);

        if ($task->status !== $oldStatus) {
            $triggeredBy = $request->user()->id;
            $statusLabels = [
                'todo' => 'To Do',
                'in_progress' => 'In Progress',
                'review' => 'Review',
                'blocked' => 'Blocked',
                'done' => 'Done',
                'cancelled' => 'Cancelled'
            ];
            $statusLabel = $statusLabels[$task->status] ?? $task->status;

            $usersToAlert = array_filter(array_unique([
                $task->created_by,
                $task->project?->manager_id,
                $task->assigned_to
            ]));

            foreach ($usersToAlert as $userId) {
                if ($userId !== $triggeredBy) {
                    \App\Services\NotificationService::alert('task_status_changed', [
                        'user_id' => $userId,
                        'triggered_by' => $triggeredBy,
                        'type' => 'task_status_changed',
                        'title' => 'Task Status Changed',
                        'body' => "Task \"{$task->title}\" status updated to {$statusLabel}.",
                        'action_url' => "/tasks",
                        'metadata' => ['task_id' => $task->id, 'status' => $task->status],
                    ]);
                }
            }
        }

        return (new TaskResource($task))->response();
    }

    /**
     * Update completion percentage only (PATCH).
     */
    public function updateCompletion(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        $validated = $request->validate([
            'completion_percentage' => 'required|integer|min:0|max:100',
        ]);

        $oldStatus = $task->status;
        $task->update($validated);
        $task->load(['project', 'assignee', 'milestone']);

        if ($task->status !== $oldStatus) {
            $triggeredBy = $request->user()->id;
            $statusLabels = [
                'todo' => 'To Do',
                'in_progress' => 'In Progress',
                'review' => 'Review',
                'blocked' => 'Blocked',
                'done' => 'Done',
                'cancelled' => 'Cancelled'
            ];
            $statusLabel = $statusLabels[$task->status] ?? $task->status;

            $usersToAlert = array_filter(array_unique([
                $task->created_by,
                $task->project?->manager_id,
                $task->assigned_to
            ]));

            foreach ($usersToAlert as $userId) {
                if ($userId !== $triggeredBy) {
                    \App\Services\NotificationService::alert('task_status_changed', [
                        'user_id' => $userId,
                        'triggered_by' => $triggeredBy,
                        'type' => 'task_status_changed',
                        'title' => 'Task Status Changed',
                        'body' => "Task \"{$task->title}\" status updated to {$statusLabel}.",
                        'action_url' => "/tasks",
                        'metadata' => ['task_id' => $task->id, 'status' => $task->status],
                    ]);
                }
            }
        }

        return (new TaskResource($task))->response();
    }

    /**
     * Add a comment to the task.
     */
    public function addComment(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('view', $task);

        $validated = $request->validate([
            'comment' => 'required|string',
            'is_internal' => 'nullable|boolean',
        ]);

        $comment = $task->comments()->create([
            'user_id' => $request->user()->id,
            'comment' => $validated['comment'],
            'is_internal' => $validated['is_internal'] ?? false,
        ]);

        $comment->load('user');

        $commentText = $validated['comment'];
        $triggeredBy = $request->user()->id;

        preg_match_all('/@([a-zA-Z0-9_\-\.]+)/', $commentText, $matches);
        $mentionedNames = array_unique($matches[1] ?? []);
        $notifiedUserIds = [];

        foreach ($mentionedNames as $name) {
            $mentionedUser = \App\Models\User::where('name', 'like', "%{$name}%")->first();
            if ($mentionedUser && $mentionedUser->id !== $triggeredBy) {
                \App\Services\NotificationService::alert('mention', [
                    'user_id' => $mentionedUser->id,
                    'triggered_by' => $triggeredBy,
                    'type' => 'mention',
                    'title' => 'You were mentioned',
                    'body' => "{$request->user()->name} mentioned you in a comment on task: {$task->title}.",
                    'action_url' => "/tasks",
                    'metadata' => ['task_id' => $task->id, 'comment_id' => $comment->id],
                ]);
                $notifiedUserIds[] = $mentionedUser->id;
            }
        }

        $usersToAlert = array_filter(array_unique([
            $task->assigned_to,
            $task->created_by,
            $task->project?->manager_id
        ]));

        foreach ($usersToAlert as $userId) {
            if ($userId !== $triggeredBy && !in_array($userId, $notifiedUserIds, true)) {
                \App\Services\NotificationService::alert('task_commented', [
                    'user_id' => $userId,
                    'triggered_by' => $triggeredBy,
                    'type' => 'task_commented',
                    'title' => 'New Comment on Task',
                    'body' => "{$request->user()->name} commented on: {$task->title}.",
                    'action_url' => "/tasks",
                    'metadata' => ['task_id' => $task->id, 'comment_id' => $comment->id],
                ]);
            }
        }

        return response()->json([
            'data' => [
                'id' => $comment->id,
                'task_id' => $comment->task_id,
                'user_id' => $comment->user_id,
                'comment' => $comment->comment,
                'is_internal' => $comment->is_internal,
                'user_name' => $comment->user?->name,
                'created_at' => $comment->created_at?->toIso8601String(),
            ]
        ], 201);
    }

    /**
     * List comments for a task.
     */
    public function listComments(Task $task): JsonResponse
    {
        Gate::authorize('view', $task);

        $comments = $task->comments()->with('user')->orderBy('created_at', 'desc')->get();
        return response()->json([
            'data' => $comments->map(fn($comment) => [
                'id' => $comment->id,
                'task_id' => $comment->task_id,
                'user_id' => $comment->user_id,
                'comment' => $comment->comment,
                'is_internal' => $comment->is_internal,
                'user_name' => $comment->user?->name,
                'created_at' => $comment->created_at?->toIso8601String(),
            ])
        ]);
    }

    /**
     * Log time entry directly from a task.
     */
    public function logTime(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('create', Timesheet::class);

        $validated = $request->validate([
            'date' => 'required|date',
            'hours_logged' => 'required|numeric|min:0.01|max:24',
            'description' => 'nullable|string',
            'is_billable' => 'nullable|boolean',
        ]);

        $timesheet = Timesheet::create([
            'user_id' => $request->user()->id,
            'task_id' => $task->id,
            'project_id' => $task->project_id,
            'date' => $validated['date'],
            'hours_logged' => $validated['hours_logged'],
            'description' => $validated['description'] ?? null,
            'is_billable' => $validated['is_billable'] ?? true,
            'status' => 'draft',
        ]);

        $timesheet->load(['user', 'task', 'project']);
        return (new \App\Http\Resources\TimesheetResource($timesheet))->response()->setStatusCode(201);
    }

    /**
     * Start (or resume) the task timer.
     */
    public function startTimer(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        if (! $task->timer_started_at) {
            $updates = ['timer_started_at' => now()];
            if ($task->status === 'todo') {
                $updates['status'] = 'in_progress';
            }
            $task->update($updates);
        }

        $task->load(['project', 'assignee', 'milestone']);
        return (new TaskResource($task))->response();
    }

    /**
     * Pause the task timer, banking the elapsed seconds.
     */
    public function pauseTimer(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        if ($task->timer_started_at) {
            $task->update([
                'timer_accumulated_seconds' => $task->timer_accumulated_seconds + $this->timerElapsedSeconds($task),
                'timer_started_at' => null,
            ]);
        }

        $task->load(['project', 'assignee', 'milestone']);
        return (new TaskResource($task))->response();
    }

    /**
     * Stop the task timer and log the tracked time as a timesheet entry.
     */
    public function stopTimer(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        $totalSeconds = $task->timer_accumulated_seconds + $this->timerElapsedSeconds($task);

        // Timesheet hours_logged has a 0.01h floor — skip logging anything under 36 seconds.
        if ($totalSeconds >= 36) {
            Gate::authorize('create', Timesheet::class);
            Timesheet::create([
                'user_id' => $request->user()->id,
                'task_id' => $task->id,
                'project_id' => $task->project_id,
                'date' => now()->toDateString(),
                'hours_logged' => min(round($totalSeconds / 3600, 2), 24),
                'description' => 'Tracked via task timer',
                'is_billable' => true,
                'status' => 'draft',
            ]);
        }

        $task->update(['timer_started_at' => null, 'timer_accumulated_seconds' => 0]);

        $task->load(['project', 'assignee', 'milestone']);
        return (new TaskResource($task))->response();
    }

    /**
     * Reset the task timer without logging any time.
     */
    public function resetTimer(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        $task->update(['timer_started_at' => null, 'timer_accumulated_seconds' => 0]);

        $task->load(['project', 'assignee', 'milestone']);
        return (new TaskResource($task))->response();
    }

    /**
     * Complete the task and timer: stop timer, log timesheet, mark task done (100%),
     * update actual_hours, update project completion %, and recalculate labor cost & profitability.
     */
    public function completeTimer(Request $request, Task $task): JsonResponse
    {
        Gate::authorize('update', $task);

        $totalSeconds = $task->timer_accumulated_seconds + $this->timerElapsedSeconds($task);
        $hoursToLog = round($totalSeconds / 3600, 2);

        // If time was tracked or timer was active, log a timesheet entry
        if ($hoursToLog > 0 || $totalSeconds > 0) {
            $effectiveHours = max(0.01, min($hoursToLog > 0 ? $hoursToLog : 0.1, 24.0));
            
            Gate::authorize('create', Timesheet::class);
            Timesheet::create([
                'user_id' => $request->user()->id,
                'task_id' => $task->id,
                'project_id' => $task->project_id,
                'date' => now()->toDateString(),
                'hours_logged' => $effectiveHours,
                'description' => 'Logged via One-Click Task Completion',
                'is_billable' => true,
                'status' => 'approved',
            ]);
        }

        // Calculate total actual hours from all timesheets for this task
        $totalTaskHours = (float) Timesheet::where('task_id', $task->id)->sum('hours_logged');

        // Update task status, completion percentage, actual_hours, and clear timer fields
        $task->update([
            'status' => 'done',
            'completion_percentage' => 100,
            'actual_hours' => max((float)$task->actual_hours, $totalTaskHours),
            'timer_started_at' => null,
            'timer_accumulated_seconds' => 0,
        ]);

        $task->load(['project', 'assignee', 'milestone']);

        // Update Project completion percentage and metrics if linked to a project
        $projectData = null;
        if ($task->project_id && $project = $task->project) {
            $totalProjectTasks = $project->tasks()->count();
            $completedProjectTasks = $project->tasks()->where('status', 'done')->count();

            if ($totalProjectTasks > 0) {
                $newProjectCompletion = (int) round(($completedProjectTasks / $totalProjectTasks) * 100);
                $project->update(['completion_percentage' => $newProjectCompletion]);
            }

            $profitabilityService = new \App\Services\ProfitabilityService();
            $projectData = [
                'completion_percentage' => $project->completion_percentage,
                'profitability' => $profitabilityService->calculate($project),
            ];
        }

        $responseData = (new TaskResource($task))->toArray($request);
        if ($projectData) {
            $responseData['project_metrics'] = $projectData;
        }

        return response()->json([
            'data' => $responseData,
            'message' => 'Task completed successfully',
        ]);
    }

    private function timerElapsedSeconds(Task $task): int
    {
        if (! $task->timer_started_at) {
            return 0;
        }

        return max(0, (int) $task->timer_started_at->diffInSeconds(now()));
    }

    /**
     * List tasks for a specific project.
     */
    public function projectTasks(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        $tasks = $project->tasks()->with(['assignee', 'milestone', 'project'])->get();
        return TaskResource::collection($tasks)->response();
    }
}
