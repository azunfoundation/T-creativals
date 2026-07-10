<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VendorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $vendors = Vendor::with('currency')
            ->where('is_active', true)
            ->get();

        return response()->json($vendors);
    }

    public function store(Request $request): JsonResponse
    {
        if (!$request->user()->hasAnyRole(['finance', 'founder', 'director'])) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'contact_name' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:100'],
            'phone' => ['nullable', 'string', 'max:30'],
            'website' => ['nullable', 'url'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $vendor = Vendor::create($validated);

        return response()->json($vendor, 201);
    }

    public function show(Vendor $vendor): JsonResponse
    {
        return response()->json($vendor->load('currency'));
    }

    public function update(Request $request, Vendor $vendor): JsonResponse
    {
        if (!$request->user()->hasAnyRole(['finance', 'founder', 'director'])) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'contact_name' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:100'],
            'phone' => ['nullable', 'string', 'max:30'],
            'website' => ['nullable', 'url'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $vendor->update($validated);

        return response()->json($vendor);
    }

    public function destroy(Request $request, Vendor $vendor): JsonResponse
    {
        if (!$request->user()->hasAnyRole(['finance', 'founder', 'director'])) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($vendor->expenses()->exists()) {
            return response()->json([
                'message' => 'This vendor has existing expenses linked to it and cannot be deleted.',
            ], 422);
        }

        $vendor->delete();

        return response()->json(['message' => 'Vendor deleted successfully.']);
    }
}
