<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PackageResource;
use App\Models\Package;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PackageController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse|AnonymousResourceCollection
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.view') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $packages = Package::with(['currency', 'services'])
            ->orderBy('name')
            ->get();

        return PackageResource::collection($packages);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse|PackageResource
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:packages,name'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:packages,slug'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'numeric', 'min:0'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'billing_cycle' => ['required', 'string', 'in:one_time,monthly,quarterly,yearly'],
            'is_active' => ['nullable', 'boolean'],
            'is_featured' => ['nullable', 'boolean'],
            'services' => ['nullable', 'array'],
            'services.*.service_id' => ['required_with:services', 'exists:services,id'],
            'services.*.custom_price' => ['nullable', 'numeric', 'min:0'],
            'services.*.quantity' => ['nullable', 'integer', 'min:1'],
            'services.*.description' => ['nullable', 'string'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $package = DB::transaction(function () use ($validated, $request) {
            $package = Package::create($validated);

            if (!empty($request->input('services'))) {
                $syncData = [];
                foreach ($request->input('services') as $item) {
                    $syncData[$item['service_id']] = [
                        'custom_price' => $item['custom_price'] ?? null,
                        'quantity' => $item['quantity'] ?? 1,
                        'description' => $item['description'] ?? null,
                    ];
                }
                $package->services()->sync($syncData);
            }

            return $package;
        });

        return (new PackageResource($package->load(['currency', 'services'])))
            ->additional(['message' => 'Package created successfully.']);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Package $package): JsonResponse|PackageResource
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.view') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return new PackageResource($package->load(['currency', 'services']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Package $package): JsonResponse|PackageResource
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', 'unique:packages,name,' . $package->id],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'unique:packages,slug,' . $package->id],
            'description' => ['nullable', 'string'],
            'price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'currency_id' => ['sometimes', 'required', 'exists:currencies,id'],
            'billing_cycle' => ['sometimes', 'required', 'string', 'in:one_time,monthly,quarterly,yearly'],
            'is_active' => ['nullable', 'boolean'],
            'is_featured' => ['nullable', 'boolean'],
            'services' => ['nullable', 'array'],
            'services.*.service_id' => ['required_with:services', 'exists:services,id'],
            'services.*.custom_price' => ['nullable', 'numeric', 'min:0'],
            'services.*.quantity' => ['nullable', 'integer', 'min:1'],
            'services.*.description' => ['nullable', 'string'],
        ]);

        if (isset($validated['name']) && empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $package = DB::transaction(function () use ($package, $validated, $request) {
            $package->update($validated);

            if ($request->has('services')) {
                $syncData = [];
                if (!empty($request->input('services'))) {
                    foreach ($request->input('services') as $item) {
                        $syncData[$item['service_id']] = [
                            'custom_price' => $item['custom_price'] ?? null,
                            'quantity' => $item['quantity'] ?? 1,
                            'description' => $item['description'] ?? null,
                        ];
                    }
                }
                $package->services()->sync($syncData);
            }

            return $package;
        });

        return (new PackageResource($package->load(['currency', 'services'])))
            ->additional(['message' => 'Package updated successfully.']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Package $package): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $package->delete();

        return response()->json([
            'message' => 'Package deleted successfully.',
        ]);
    }
}
