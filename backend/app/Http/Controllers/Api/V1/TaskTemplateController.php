<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Task templates (PRD: "Service Templates Required" — e.g. a Website project
 * auto-creating Domain Setup → Hosting → UI Design → Development → Testing →
 * Launch, and a monthly SEO retainer auto-creating its monthly tasks).
 * The task_templates schema existed since Sprint 5 with zero API or UI —
 * this controller is its first wiring.
 */
class TaskTemplateController extends Controller
{
    protected function deny(): JsonResponse
    {
        return response()->json(['message' => 'This action is unauthorized.'], 403);
    }

    /** Managing templates is project-management configuration. */
    protected function canManage(Request $request): bool
    {
        return $request->user()->hasPermissionTo('projects.create');
    }

    public function index(Request $request): JsonResponse
    {
        // Anyone who can see projects can browse templates (needed to pick
        // one when applying); managing them needs projects.create.
        if (!$request->user()->hasAnyPermission(['projects.view', 'projects.view_all', 'projects.create'])) {
            return $this->deny();
        }

        return response()->json([
            'data' => TaskTemplate::with(['items' => fn ($q) => $q->orderBy('sort_order')])
                ->withCount('items')
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (!$this->canManage($request)) {
            return $this->deny();
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.title' => ['required', 'string', 'max:255'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.estimated_hours' => ['nullable', 'numeric', 'min:0'],
        ]);

        $template = DB::transaction(function () use ($validated, $request) {
            $template = TaskTemplate::create([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'created_by' => $request->user()->id,
                'estimated_hours' => collect($validated['items'])->sum(fn ($i) => (float) ($i['estimated_hours'] ?? 0)),
            ]);
            foreach ($validated['items'] as $index => $item) {
                $template->items()->create([
                    'title' => $item['title'],
                    'description' => $item['description'] ?? null,
                    'estimated_hours' => $item['estimated_hours'] ?? null,
                    'sort_order' => $index,
                ]);
            }
            return $template;
        });

        return response()->json([
            'message' => 'Template created.',
            'data' => $template->load('items'),
        ], 201);
    }

    public function update(Request $request, TaskTemplate $taskTemplate): JsonResponse
    {
        if (!$this->canManage($request)) {
            return $this->deny();
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.title' => ['required_with:items', 'string', 'max:255'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.estimated_hours' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($taskTemplate, $validated) {
            $taskTemplate->update(collect($validated)->only(['name', 'description'])->toArray());
            if (isset($validated['items'])) {
                // Items are replaced wholesale — the template is a recipe, not
                // history (tasks already created from it are untouched).
                $taskTemplate->items()->delete();
                foreach ($validated['items'] as $index => $item) {
                    $taskTemplate->items()->create([
                        'title' => $item['title'],
                        'description' => $item['description'] ?? null,
                        'estimated_hours' => $item['estimated_hours'] ?? null,
                        'sort_order' => $index,
                    ]);
                }
                $taskTemplate->update([
                    'estimated_hours' => collect($validated['items'])->sum(fn ($i) => (float) ($i['estimated_hours'] ?? 0)),
                ]);
            }
        });

        return response()->json([
            'message' => 'Template updated.',
            'data' => $taskTemplate->fresh()->load('items'),
        ]);
    }

    public function destroy(Request $request, TaskTemplate $taskTemplate): JsonResponse
    {
        if (!$this->canManage($request)) {
            return $this->deny();
        }

        // Projects referencing it fall back to null (recurring generation
        // simply stops); existing tasks keep their data.
        $taskTemplate->delete();

        return response()->json(['message' => 'Template deleted. Projects that used it will no longer auto-generate its tasks.']);
    }

    /**
     * Apply a template to a project: create one task per template item.
     * POST /api/v1/projects/{project}/apply-template
     */
    public function applyToProject(Request $request, Project $project): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('projects.edit')) {
            return $this->deny();
        }

        $validated = $request->validate([
            'template_id' => ['required', 'exists:task_templates,id'],
            // When true, the template is also linked as the project's
            // recurring recipe (monthly auto-generation for retainers).
            'set_as_recurring_template' => ['nullable', 'boolean'],
        ]);

        $template = TaskTemplate::with(['items' => fn ($q) => $q->orderBy('sort_order')])
            ->findOrFail($validated['template_id']);

        $created = DB::transaction(function () use ($template, $project, $request) {
            $tasks = [];
            foreach ($template->items as $item) {
                $tasks[] = Task::create([
                    'project_id' => $project->id,
                    'task_template_id' => $template->id,
                    'title' => $item->title,
                    'description' => $item->description,
                    'estimated_hours' => $item->estimated_hours,
                    'status' => 'todo',
                    'priority' => 'medium',
                    'created_by' => $request->user()->id,
                    'sort_order' => $item->sort_order,
                ]);
            }
            return $tasks;
        });

        if (!empty($validated['set_as_recurring_template'])) {
            $project->update(['task_template_id' => $template->id]);
        }

        return response()->json([
            'message' => count($created) . ' task(s) created from the "' . $template->name . '" template.',
            'data' => ['created_count' => count($created)],
        ], 201);
    }
}
