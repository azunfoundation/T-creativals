<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClientCredential;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ClientCredentialController extends Controller
{
    /**
     * Enforce Founder-only access for all vault operations.
     */
    protected function checkFounder(Request $request): void
    {
        if (!$request->user() || !$request->user()->hasRole('founder')) {
            abort(403, 'Access denied. This page is restricted to the Founder.');
        }
    }

    /**
     * List all credentials with search, filtering, and stats.
     */
    public function index(Request $request): JsonResponse
    {
        $this->checkFounder($request);

        $query = ClientCredential::query();

        // Filter out archived unless specifically viewing archived
        $showArchived = $request->boolean('archived', false);
        $query->where('is_archived', $showArchived);

        // Search
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where(function ($q) use ($search) {
                $q->where('client_name', 'like', "%{$search}%")
                  ->orWhere('platform', 'like', "%{$search}%")
                  ->orWhere('username', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhere('login_url', 'like', "%{$search}%")
                  ->orWhere('tags', 'like', "%{$search}%");
            });
        }

        // Tab quick filtering
        if ($request->filled('tab')) {
            $tab = strtolower($request->string('tab')->trim()->toString());
            switch ($tab) {
                case 'favorites':
                    $query->where('is_favorite', true);
                    break;
                case 'recently_used':
                    $query->whereNotNull('last_used_at');
                    break;
                case 'wordpress':
                    $query->where('platform', 'like', '%wordpress%');
                    break;
                case 'hosting':
                    $query->where(function ($q) {
                        $q->where('credential_type', 'like', '%hosting%')
                          ->orWhere('platform', 'like', '%hosting%')
                          ->orWhere('platform', 'like', '%cpanel%')
                          ->orWhere('platform', 'like', '%whm%')
                          ->orWhere('platform', 'like', '%server%');
                    });
                    break;
                case 'domains':
                    $query->where(function ($q) {
                        $q->where('credential_type', 'like', '%domain%')
                          ->orWhere('platform', 'like', '%godaddy%')
                          ->orWhere('platform', 'like', '%namecheap%')
                          ->orWhere('platform', 'like', '%domain%');
                    });
                    break;
                case 'meta':
                    $query->where(function ($q) {
                        $q->where('platform', 'like', '%meta%')
                          ->orWhere('platform', 'like', '%facebook%')
                          ->orWhere('platform', 'like', '%instagram%');
                    });
                    break;
                case 'google':
                    $query->where('platform', 'like', '%google%');
                    break;
                case 'stripe':
                    $query->where('platform', 'like', '%stripe%');
                    break;
                case 'shopify':
                    $query->where('platform', 'like', '%shopify%');
                    break;
                case 'cloudflare':
                    $query->where('platform', 'like', '%cloudflare%');
                    break;
                case 'email':
                    $query->where(function ($q) {
                        $q->where('credential_type', 'like', '%email%')
                          ->orWhere('platform', 'like', '%zoho%')
                          ->orWhere('platform', 'like', '%outlook%')
                          ->orWhere('platform', 'like', '%gmail%')
                          ->orWhere('platform', 'like', '%email%');
                    });
                    break;
                case 'apis':
                    $query->where(function ($q) {
                        $q->where('credential_type', 'like', '%api%')
                          ->orWhere('platform', 'like', '%api%')
                          ->orWhere('platform', 'like', '%token%')
                          ->orWhere('platform', 'like', '%secret%');
                    });
                    break;
                case 'other':
                    $knownPlatforms = [
                        'wordpress', 'hosting', 'cpanel', 'whm', 'server', 'domain', 'godaddy',
                        'namecheap', 'meta', 'facebook', 'instagram', 'google', 'stripe',
                        'shopify', 'cloudflare', 'email', 'zoho', 'outlook', 'gmail', 'api', 'token'
                    ];
                    $query->where(function ($q) use ($knownPlatforms) {
                        foreach ($knownPlatforms as $kp) {
                            $q->where('platform', 'not like', "%{$kp}%");
                        }
                    });
                    break;
            }
        }

        // Multi-select filters
        if ($request->filled('client_id')) {
            $query->where('client_id', $request->input('client_id'));
        }
        if ($request->filled('client_name_filter')) {
            $query->where('client_name', $request->input('client_name_filter'));
        }
        if ($request->filled('platform_filter')) {
            $query->where('platform', $request->input('platform_filter'));
        }
        if ($request->filled('type_filter')) {
            $query->where('credential_type', $request->input('type_filter'));
        }

        // Sorting
        $sortBy = $request->string('sort_by', 'updated_at')->toString();
        $sortDir = $request->string('sort_dir', 'desc')->toString();
        
        // Ensure white-listed sorting columns
        $allowedSort = ['client_name', 'platform', 'credential_type', 'username', 'updated_at', 'last_used_at'];
        if (in_array($sortBy, $allowedSort, true)) {
            if ($sortBy === 'last_used_at' || $sortBy === 'updated_at') {
                $query->orderByRaw('last_used_at IS NULL, last_used_at ' . $sortDir);
            }
            $query->orderBy($sortBy, $sortDir);
        } else {
            $query->orderBy('updated_at', 'desc');
        }

        // Pagination
        $perPage = $request->integer('per_page', 50);
        $credentials = $credentials = $query->paginate($perPage);

        // Stats Aggregation
        $stats = [
            'total_credentials' => ClientCredential::active()->count(),
            'favorite_credentials' => ClientCredential::active()->where('is_favorite', true)->count(),
            'recently_used' => ClientCredential::active()->whereNotNull('last_used_at')->count(),
        ];

        // Also fetch unique filter values for the dropdowns
        $filterOptions = [
            'clients' => ClientCredential::active()->select('client_name')->distinct()->pluck('client_name')->filter()->values(),
            'platforms' => ClientCredential::active()->select('platform')->distinct()->pluck('platform')->filter()->values(),
            'types' => ClientCredential::active()->select('credential_type')->distinct()->pluck('credential_type')->filter()->values(),
        ];

        return response()->json([
            'data' => $credentials->items(),
            'meta' => [
                'current_page' => $credentials->currentPage(),
                'last_page' => $credentials->lastPage(),
                'per_page' => $credentials->perPage(),
                'total' => $credentials->total(),
            ],
            'stats' => $stats,
            'filters' => $filterOptions
        ]);
    }

    /**
     * Store a credential.
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkFounder($request);

        $validated = $request->validate([
            'client_name' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'exists:users,id'],
            'platform' => ['required', 'string', 'max:255'],
            'credential_type' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'login_url' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string'],
            'tags' => ['nullable', 'string'],
            'is_favorite' => ['boolean'],
        ]);

        $credential = ClientCredential::create($validated);

        return response()->json([
            'message' => 'Credential added successfully.',
            'data' => $credential,
        ], 201);
    }

    /**
     * Show a credential.
     */
    public function show(Request $request, $id): JsonResponse
    {
        $this->checkFounder($request);

        $credential = ClientCredential::findOrFail($id);

        return response()->json([
            'data' => $credential,
        ]);
    }

    /**
     * Update a credential.
     */
    public function update(Request $request, $id): JsonResponse
    {
        $this->checkFounder($request);

        $credential = ClientCredential::findOrFail($id);

        $validated = $request->validate([
            'client_name' => ['sometimes', 'required', 'string', 'max:255'],
            'client_id' => ['nullable', 'exists:users,id'],
            'platform' => ['sometimes', 'required', 'string', 'max:255'],
            'credential_type' => ['sometimes', 'required', 'string', 'max:255'],
            'username' => ['sometimes', 'required', 'string', 'max:255'],
            'password' => ['sometimes', 'required', 'string'],
            'login_url' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string'],
            'tags' => ['nullable', 'string'],
            'is_favorite' => ['boolean'],
            'is_archived' => ['boolean'],
        ]);

        $credential->update($validated);

        return response()->json([
            'message' => 'Credential updated successfully.',
            'data' => $credential,
        ]);
    }

    /**
     * Delete a credential.
     */
    public function destroy(Request $request, $id): JsonResponse
    {
        $this->checkFounder($request);

        $credential = ClientCredential::findOrFail($id);
        $credential->delete();

        return response()->json([
            'message' => 'Credential deleted successfully.',
        ]);
    }

    /**
     * Duplicate a credential.
     */
    public function duplicate(Request $request, $id): JsonResponse
    {
        $this->checkFounder($request);

        $original = ClientCredential::findOrFail($id);
        
        $duplicate = $original->replicate();
        $duplicate->client_name = $original->client_name . ' (Copy)';
        $duplicate->is_favorite = false;
        $duplicate->last_used_at = null;
        $duplicate->save();

        return response()->json([
            'message' => 'Credential duplicated successfully.',
            'data' => $duplicate,
        ], 201);
    }

    /**
     * Log a credential usage (last_used_at updated for recently used list).
     */
    public function logUsage(Request $request, $id): JsonResponse
    {
        $this->checkFounder($request);

        $credential = ClientCredential::findOrFail($id);
        $credential->update(['last_used_at' => Carbon::now()]);

        return response()->json([
            'message' => 'Credential usage logged.',
            'data' => $credential,
        ]);
    }

    /**
     * Bulk archive.
     */
    public function bulkArchive(Request $request): JsonResponse
    {
        $this->checkFounder($request);

        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer', 'exists:client_credentials,id'],
        ]);

        ClientCredential::whereIn('id', $validated['ids'])->update(['is_archived' => true]);

        return response()->json([
            'message' => count($validated['ids']) . ' credential(s) archived successfully.',
        ]);
    }

    /**
     * Bulk delete.
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $this->checkFounder($request);

        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer', 'exists:client_credentials,id'],
        ]);

        ClientCredential::whereIn('id', $validated['ids'])->delete();

        return response()->json([
            'message' => count($validated['ids']) . ' credential(s) deleted successfully.',
        ]);
    }

    /**
     * Bulk Import from JSON.
     */
    public function import(Request $request): JsonResponse
    {
        $this->checkFounder($request);

        $validated = $request->validate([
            'credentials' => ['required', 'array'],
            'credentials.*.client_name' => ['required', 'string', 'max:255'],
            'credentials.*.platform' => ['required', 'string', 'max:255'],
            'credentials.*.credential_type' => ['required', 'string', 'max:255'],
            'credentials.*.username' => ['required', 'string', 'max:255'],
            'credentials.*.password' => ['required', 'string'],
            'credentials.*.login_url' => ['nullable', 'string'],
            'credentials.*.notes' => ['nullable', 'string'],
            'credentials.*.tags' => ['nullable', 'string'],
            'credentials.*.is_favorite' => ['nullable', 'boolean'],
        ]);

        $count = 0;
        DB::transaction(function () use ($validated, &$count) {
            foreach ($validated['credentials'] as $item) {
                ClientCredential::create([
                    'client_name' => $item['client_name'],
                    'platform' => $item['platform'],
                    'credential_type' => $item['credential_type'],
                    'username' => $item['username'],
                    'password' => $item['password'],
                    'login_url' => $item['login_url'] ?? null,
                    'notes' => $item['notes'] ?? null,
                    'tags' => $item['tags'] ?? null,
                    'is_favorite' => $item['is_favorite'] ?? false,
                ]);
                $count++;
            }
        });

        return response()->json([
            'message' => $count . ' credentials imported successfully.',
        ]);
    }
}
