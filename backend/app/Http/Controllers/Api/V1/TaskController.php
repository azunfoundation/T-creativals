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

        if ($user->hasRole('founder')) {
            // Founder can see all tasks
        } else {
            // Filter tasks by assignment, creation, or project membership
            $query->where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                  ->orWhere('created_by', $user->id)
                  ->orWhereHas('project', function ($pq) use ($user) {
                      $pq->where('manager_id', $user->id)
                        ->orWhereHas('members', function ($mq) use ($user) {
                            $mq->where('user_id', $user->id);
                        });
                  });
            });
        }

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->has('priority')) {
            $query->where('priority', $request->input('priority'));
        }
        if ($request->has('project_id')) {
            $query->where('project_id', $request->input('project_id'));
        }
        if ($request->has('assigned_to')) {
            $query->where('assigned_to', $request->input('assigned_to'));
        }
        if ($request->has('parent_task_id')) {
            $query->where('parent_task_id', $request->input('parent_task_id'));
        }

        $tasks = $query->paginate((int) $request->input('per_page', 15));
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
        ]);

        $validated['created_by'] = $request->user()->id;

        $task = Task::create($validated);
        $task->load(['project', 'assignee', 'milestone']);

        if ($task->assigned_to && $task->assignee) {
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

        $task->update($validated);
        $task->load(['project', 'assignee', 'milestone']);

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

        $task->update($validated);
        $task->load(['project', 'assignee', 'milestone']);

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
     * List tasks for a specific project.
     */
    public function projectTasks(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        $tasks = $project->tasks()->with(['assignee', 'milestone', 'project'])->get();
        return TaskResource::collection($tasks)->response();
    }
}
