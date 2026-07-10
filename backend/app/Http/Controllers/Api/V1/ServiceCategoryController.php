<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ServiceCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ServiceCategoryController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.view') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $categories = ServiceCategory::orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $categories,
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:service_categories,name'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:service_categories,slug'],
            'description' => ['nullable', 'string'],
            'color' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $category = ServiceCategory::create($validated);

        return response()->json([
            'message' => 'Service category created successfully.',
            'data' => $category,
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, ServiceCategory $serviceCategory): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.view') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return response()->json([
            'data' => $serviceCategory,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, ServiceCategory $serviceCategory): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', 'unique:service_categories,name,' . $serviceCategory->id],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'unique:service_categories,slug,' . $serviceCategory->id],
            'description' => ['nullable', 'string'],
            'color' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if (isset($validated['name']) && empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $serviceCategory->update($validated);

        return response()->json([
            'message' => 'Service category updated successfully.',
            'data' => $serviceCategory,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, ServiceCategory $serviceCategory): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $serviceCategory->delete();

        return response()->json([
            'message' => 'Service category deleted successfully.',
        ]);
    }
}
