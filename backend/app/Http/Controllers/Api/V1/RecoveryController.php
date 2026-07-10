<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DeletedRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class RecoveryController extends Controller
{
    /**
     * Display a paginated list of deleted records.
     * Founder-only endpoint.
     * GET /recovery-bin
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('access-recovery-bin');

        $query = DeletedRecord::query()
            ->with('deletedBy:id,name,email,avatar_url')
            ->orderByDesc('deleted_at');

        // Filter by model type
        if ($request->filled('type')) {
            $query->where('deletable_type', $request->string('type'));
        }

        // Filter by date range
        if ($request->filled('from')) {
            $query->whereDate('deleted_at', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('deleted_at', '<=', $request->input('to'));
        }

        // Filter by deleted_by user
        if ($request->filled('deleted_by')) {
            $query->where('deleted_by', $request->integer('deleted_by'));
        }

        // Search within record_snapshot JSON
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where(function ($q) use ($search) {
                $q->where('record_snapshot', 'like', "%{$search}%")
                  ->orWhere('deletion_reason', 'like', "%{$search}%");
            });
        }

        $records = $query->paginate($request->integer('per_page', 20));

        $records->getCollection()->transform(function (DeletedRecord $record) {
            return $this->formatDeletedRecord($record);
        });

        return response()->json([
            'data'    => $records->items(),
            'meta'    => [
                'current_page' => $records->currentPage(),
                'last_page'    => $records->lastPage(),
                'per_page'     => $records->perPage(),
                'total'        => $records->total(),
            ],
            'message' => 'Deleted records retrieved successfully.',
        ]);
    }

    /**
     * Restore a deleted record back to its original table.
     * POST /recovery-bin/{id}/restore
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        Gate::authorize('access-recovery-bin');

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $deletedRecord = DeletedRecord::findOrFail($id);

        // Resolve the model class
        $modelClass = $deletedRecord->deletable_type;

        if (!class_exists($modelClass)) {
            return response()->json([
                'message' => "Cannot restore: model class '{$modelClass}' no longer exists.",
            ], 422);
        }

        $modelId = $deletedRecord->deletable_id;

        DB::transaction(function () use ($deletedRecord, $modelClass, $modelId, $validated) {
            // Check if the record exists with soft-delete
            $existingRecord = null;
            $usesSoftDelete = in_array(
                \Illuminate\Database\Eloquent\SoftDeletes::class,
                class_uses_recursive($modelClass),
                true
            );

            if ($usesSoftDelete) {
                $existingRecord = $modelClass::withTrashed()->find($modelId);
            } else {
                $existingRecord = $modelClass::find($modelId);
            }

            if ($existingRecord && $usesSoftDelete && $existingRecord->trashed()) {
                // Simply restore using Eloquent's restore()
                $existingRecord->restore();
            } elseif ($existingRecord) {
                // Record exists and is not deleted — nothing to restore
                throw new \RuntimeException("Record already exists and is not deleted.");
            } else {
                // Re-create from snapshot
                $snapshot = $deletedRecord->record_snapshot;

                // Remove soft-delete timestamp so it's treated as active
                if (isset($snapshot['deleted_at'])) {
                    $snapshot['deleted_at'] = null;
                }

                $modelClass::create($snapshot);
            }

            // Log restore audit event
            AuditLog::create([
                'user_id'        => auth()->id(),
                'auditable_type' => $modelClass,
                'auditable_id'   => $modelId,
                'event'          => 'restored',
                'old_values'     => ['deleted_records_id' => $deletedRecord->id],
                'new_values'     => ['reason' => $validated['reason'] ?? null],
                'ip_address'     => request()->ip(),
                'user_agent'     => request()->userAgent(),
                'url'            => request()->fullUrl(),
                'metadata'       => ['tags' => ['recovery']],
            ]);

            // Remove from deleted_records
            $deletedRecord->delete();
        });

        return response()->json([
            'data'    => null,
            'message' => 'Record restored successfully.',
        ]);
    }

    /**
     * Format a DeletedRecord for the response.
     */
    private function formatDeletedRecord(DeletedRecord $record): array
    {
        // Derive a human-readable type name from the class
        $shortType = class_basename($record->deletable_type);

        return [
            'id'              => $record->id,
            'deletable_type'  => $record->deletable_type,
            'deletable_type_label' => $shortType,
            'deletable_id'    => $record->deletable_id,
            'record_snapshot' => $record->record_snapshot,
            'deletion_reason' => $record->deletion_reason,
            'deleted_at'      => $record->deleted_at?->toIso8601String(),
            'deleted_by'      => $record->deletedBy ? [
                'id'         => $record->deletedBy->id,
                'name'       => $record->deletedBy->name,
                'email'      => $record->deletedBy->email,
                'avatar_url' => $record->deletedBy->avatar_url,
            ] : null,
        ];
    }
}
