<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceResource;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Str;

class ServiceController extends Controller
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

        $query = Service::with(['category', 'currency']);

        if ($request->has('category_id')) {
            $query->where('category_id', $request->input('category_id'));
        }

        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $services = $query->orderBy('name')->get();

        return ServiceResource::collection($services);
    }

    /**
     * Accept the field names the frontend sends (base_price, unit) alongside the
     * canonical columns (default_price, billing_type, currency_id). Without this,
     * creating a service from the UI always failed validation with 422.
     */
    private function normalizeServiceInput(Request $request, bool $forCreate = false): void
    {
        if (! $request->filled('default_price') && $request->filled('base_price')) {
            $request->merge(['default_price' => $request->input('base_price')]);
        }

        // Only inject defaults when creating — a partial update must never
        // silently change billing_type or currency.
        if ($forCreate && ! $request->filled('billing_type')) {
            $request->merge(['billing_type' => match ($request->input('unit')) {
                'hour', 'hourly'   => 'hourly',
                'month', 'monthly' => 'monthly',
                'year', 'yearly'   => 'yearly',
                default            => 'fixed',
            }]);
        }

        if ($forCreate && ! $request->filled('currency_id')) {
            $defaultCurrencyId = \App\Models\Currency::where('is_default', true)->value('id')
                ?? \App\Models\Currency::query()->value('id');
            if ($defaultCurrencyId) {
                $request->merge(['currency_id' => $defaultCurrencyId]);
            }
        }
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse|ServiceResource
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $this->normalizeServiceInput($request, forCreate: true);

        $validated = $request->validate([
            'category_id' => ['nullable', 'exists:service_categories,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:services,slug'],
            'description' => ['nullable', 'string'],
            'default_price' => ['required', 'numeric', 'min:0'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'billing_type' => ['required', 'string', 'in:fixed,hourly,monthly,yearly'],
            'unit' => ['nullable', 'string', 'max:50'],
            'is_active' => ['nullable', 'boolean'],
            'is_taxable' => ['nullable', 'boolean'],
            'tax_rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
            // Ensure uniqueness
            $originalSlug = $validated['slug'];
            $count = 1;
            while (Service::where('slug', $validated['slug'])->exists()) {
                $validated['slug'] = $originalSlug . '-' . $count++;
            }
        }

        $service = Service::create($validated);

        return (new ServiceResource($service->load(['category', 'currency'])))
            ->additional(['message' => 'Service created successfully.']);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Service $service): JsonResponse|ServiceResource
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.view') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return new ServiceResource($service->load(['category', 'currency']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Service $service): JsonResponse|ServiceResource
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $this->normalizeServiceInput($request);

        $validated = $request->validate([
            'category_id' => ['nullable', 'exists:service_categories,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'unique:services,slug,' . $service->id],
            'description' => ['nullable', 'string'],
            'default_price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'currency_id' => ['sometimes', 'required', 'exists:currencies,id'],
            'billing_type' => ['sometimes', 'required', 'string', 'in:fixed,hourly,monthly,yearly'],
            'unit' => ['nullable', 'string', 'max:50'],
            'is_active' => ['nullable', 'boolean'],
            'is_taxable' => ['nullable', 'boolean'],
            'tax_rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        if (isset($validated['name']) && empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $service->update($validated);

        return (new ServiceResource($service->load(['category', 'currency'])))
            ->additional(['message' => 'Service updated successfully.']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Service $service): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $service->delete();

        return response()->json([
            'message' => 'Service deleted successfully.',
        ]);
    }
}
