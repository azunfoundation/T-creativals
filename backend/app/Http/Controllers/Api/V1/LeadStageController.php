<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeadStageController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        // Any authenticated user can view lead stages
        $stages = LeadStage::orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $stages,
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:lead_stages,name'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:lead_stages,slug'],
            'color' => ['nullable', 'string', 'max:7'],
            'sort_order' => ['integer'],
            'is_system' => ['boolean'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $stage = LeadStage::create($validated);

        return response()->json([
            'message' => 'Lead stage created successfully.',
            'data' => $stage,
        ], 201);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, LeadStage $leadStage): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', 'unique:lead_stages,name,' . $leadStage->id],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'unique:lead_stages,slug,' . $leadStage->id],
            'color' => ['nullable', 'string', 'max:7'],
            'sort_order' => ['integer'],
            'is_system' => ['boolean'],
        ]);

        if (isset($validated['name']) && empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        // System stages should not change their is_system status easily or as per rules
        $leadStage->update($validated);

        return response()->json([
            'message' => 'Lead stage updated successfully.',
            'data' => $leadStage,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, LeadStage $leadStage): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($leadStage->is_system) {
            return response()->json([
                'message' => 'System stages cannot be deleted.',
            ], 422);
        }

        $leadStage->delete();

        return response()->json([
            'message' => 'Lead stage deleted successfully.',
        ]);
    }
}
