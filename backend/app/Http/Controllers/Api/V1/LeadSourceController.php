<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeadSourceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): JsonResponse
    {
        // Any authenticated user can view lead sources
        $sources = LeadSource::orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $sources,
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
            'name' => ['required', 'string', 'max:255', 'unique:lead_sources,name'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:lead_sources,slug'],
            'icon' => ['nullable', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'max:7'],
            'is_active' => ['boolean'],
            'sort_order' => ['integer'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $source = LeadSource::create($validated);

        return response()->json([
            'message' => 'Lead source created successfully.',
            'data' => $source,
        ], 201);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, LeadSource $leadSource): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', 'unique:lead_sources,name,' . $leadSource->id],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'unique:lead_sources,slug,' . $leadSource->id],
            'icon' => ['nullable', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'max:7'],
            'is_active' => ['boolean'],
            'sort_order' => ['integer'],
        ]);

        if (isset($validated['name']) && empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $leadSource->update($validated);

        return response()->json([
            'message' => 'Lead source updated successfully.',
            'data' => $leadSource,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, LeadSource $leadSource): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($leadSource->leads()->exists()) {
            return response()->json([
                'message' => 'This source is assigned to existing leads and cannot be deleted. Mark it inactive instead.',
            ], 422);
        }

        $leadSource->delete();

        return response()->json([
            'message' => 'Lead source deleted successfully.',
        ]);
    }
}
