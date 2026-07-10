<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\ProjectMemberResource;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ProjectController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Project::class);

        $user = $request->user();
        $query = Project::query()->with(['members.user', 'members.department', 'client', 'manager', 'invoice']);

        if ($user->hasRole('founder') || $user->hasPermissionTo('projects.view_all')) {
            // No filtering, see all
        } elseif ($user->hasRole('client') || $user->hasRole('client', 'web') || $user->is_client_portal_user) {
            // Client sees own
            $query->where('client_id', $user->id);
        } elseif ($user->hasPermissionTo('projects.view')) {
            // Employee sees assigned: manager of project or member of project
            $query->where(function ($q) use ($user) {
                $q->where('manager_id', $user->id)
                  ->orWhereHas('members', function ($mq) use ($user) {
                      $mq->where('user_id', $user->id);
                  });
            });
        } else {
            // Client sees own
            $query->where('client_id', $user->id);
        }

        $projects = $query->paginate((int) $request->input('per_page', 15));
        return ProjectResource::collection($projects)->response();
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Project::class);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'client_id' => 'required|exists:users,id',
            'manager_id' => 'nullable|exists:users,id',
            'status' => 'nullable|string|in:planning,in_progress,active,on_hold,completed,cancelled',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'budget_hours' => 'nullable|numeric|min:0',
            'budget_amount' => 'nullable|numeric|min:0',
            'is_recurring' => 'nullable|boolean',
            'members' => 'nullable|array',
            'members.*.user_id' => 'required|exists:users,id',
            'members.*.role' => 'nullable|string|in:manager,lead,member,viewer',
            'members.*.department_id' => 'nullable|exists:departments,id',
            'members.*.joined_at' => 'nullable|date',
        ]);

        $project = DB::transaction(function () use ($validated) {
            $projectData = collect($validated)->except('members')->toArray();
            $project = Project::create($projectData);

            if (!empty($validated['members'])) {
                foreach ($validated['members'] as $member) {
                    $project->members()->create([
                        'user_id' => $member['user_id'],
                        'role' => $member['role'] ?? 'member',
                        'department_id' => $member['department_id'] ?? null,
                        'joined_at' => $member['joined_at'] ?? now(),
                    ]);
                }
            }

            return $project;
        });

        $project->load(['members.user', 'members.department', 'client', 'manager', 'invoice']);
        return (new ProjectResource($project))->response()->setStatusCode(201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        $project->load(['members.user', 'members.department', 'client', 'manager', 'invoice']);
        $project->loadCount(['milestones', 'tasks']);

        $totalHours = $project->timesheets()->sum('hours_logged');
        $billableHours = $project->timesheets()->where('is_billable', true)->sum('hours_logged');

        return (new ProjectResource($project))->additional([
            'meta' => [
                'timesheet_summary' => [
                    'total_hours' => (float) $totalHours,
                    'billable_hours' => (float) $billableHours,
                ]
            ]
        ])->response();
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('update', $project);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'client_id' => 'sometimes|required|exists:users,id',
            'manager_id' => 'nullable|exists:users,id',
            'status' => 'nullable|string|in:planning,in_progress,active,on_hold,completed,cancelled',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'budget_hours' => 'nullable|numeric|min:0',
            'budget_amount' => 'nullable|numeric|min:0',
            'is_recurring' => 'nullable|boolean',
        ]);

        $project->update($validated);
        $project->load(['members.user', 'members.department', 'client', 'manager', 'invoice']);

        return (new ProjectResource($project))->response();
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Project $project): JsonResponse
    {
        Gate::authorize('delete', $project);

        $project->delete();

        return response()->json(['message' => 'Project deleted successfully']);
    }

    /**
     * Add a member to the project.
     */
    public function addMember(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('addMember', $project);

        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'role' => 'nullable|string|in:manager,lead,member,viewer',
            'department_id' => 'nullable|exists:departments,id',
            'joined_at' => 'nullable|date',
        ]);

        $member = $project->members()->updateOrCreate(
            ['user_id' => $validated['user_id']],
            [
                'role' => $validated['role'] ?? 'member',
                'department_id' => $validated['department_id'] ?? null,
                'joined_at' => $validated['joined_at'] ?? now(),
            ]
        );

        $member->load(['user', 'department']);
        return (new ProjectMemberResource($member))->response()->setStatusCode(200);
    }

    /**
     * Remove a member from the project.
     */
    public function removeMember(Request $request, Project $project, User $user): JsonResponse
    {
        Gate::authorize('addMember', $project);

        $project->members()->where('user_id', $user->id)->delete();

        return response()->json(['message' => 'Member removed successfully']);
    }

    /**
     * View project profitability breakdown.
     */
    public function profitability(Project $project, \App\Services\ProfitabilityService $profitabilityService): JsonResponse
    {
        Gate::authorize('profitability', $project);

        $result = $profitabilityService->calculate($project);

        return response()->json($result);
    }
}
