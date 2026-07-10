<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AiAutomation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiAutomationController extends Controller
{
    /**
     * Display a listing of user automations.
     * GET /api/v1/ai/automations
     */
    public function index(Request $request): JsonResponse
    {
        $automations = AiAutomation::where('user_id', $request->user()->id)
            ->latest()
            ->get();

        return response()->json($automations);
    }

    /**
     * Store a newly created automation rule.
     * POST /api/v1/ai/automations
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'trigger_event' => ['required', 'string', 'max:100'],
            'conditions' => ['nullable', 'array'],
            'actions' => ['required', 'array'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $automation = AiAutomation::create([
            'user_id' => $request->user()->id,
            'name' => $validated['name'],
            'trigger_event' => $validated['trigger_event'],
            'conditions' => $validated['conditions'] ?? [],
            'actions' => $validated['actions'],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json($automation, 201);
    }

    /**
     * Display the specified automation rule.
     * GET /api/v1/ai/automations/{id}
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $automation = AiAutomation::where('user_id', $request->user()->id)
            ->findOrFail($id);

        return response()->json($automation);
    }

    /**
     * Update the specified automation rule.
     * PUT /api/v1/ai/automations/{id}
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $automation = AiAutomation::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'trigger_event' => ['nullable', 'string', 'max:100'],
            'conditions' => ['nullable', 'array'],
            'actions' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $automation->update($validated);

        return response()->json($automation);
    }

    /**
     * Remove the specified automation rule.
     * DELETE /api/v1/ai/automations/{id}
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $automation = AiAutomation::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $automation->delete();

        return response()->json([
            'message' => 'Automation rule deleted successfully.',
        ]);
    }
}
