<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MilestoneResource;
use App\Models\Milestone;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class MilestoneController extends Controller
{
    /**
     * Display a listing of milestones for the project.
     */
    public function index(Project $project): JsonResponse
    {
        Gate::authorize('view', $project);

        $milestones = $project->milestones()->orderBy('sort_order')->get();
        return MilestoneResource::collection($milestones)->response();
    }

    /**
     * Store a newly created milestone in storage.
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('update', $project);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'due_date' => 'nullable|date',
            'status' => 'nullable|string|in:pending,in_progress,completed,overdue',
            'completion_percentage' => 'nullable|integer|min:0|max:100',
            'sort_order' => 'nullable|integer',
        ]);

        $milestone = $project->milestones()->create($validated);
        return (new MilestoneResource($milestone))->response()->setStatusCode(201);
    }

    /**
     * Display the specified milestone.
     */
    public function show(Milestone $milestone): JsonResponse
    {
        Gate::authorize('view', $milestone->project);

        return (new MilestoneResource($milestone))->response();
    }

    /**
     * Update the specified milestone in storage.
     */
    public function update(Request $request, Milestone $milestone): JsonResponse
    {
        Gate::authorize('update', $milestone->project);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'due_date' => 'nullable|date',
            'status' => 'nullable|string|in:pending,in_progress,completed,overdue',
            'completion_percentage' => 'nullable|integer|min:0|max:100',
            'sort_order' => 'nullable|integer',
        ]);

        $milestone->update($validated);
        return (new MilestoneResource($milestone))->response();
    }

    /**
     * Remove the specified milestone from storage.
     */
    public function destroy(Milestone $milestone): JsonResponse
    {
        Gate::authorize('update', $milestone->project);

        $milestone->delete();
        return response()->json(['message' => 'Milestone deleted successfully']);
    }
}
