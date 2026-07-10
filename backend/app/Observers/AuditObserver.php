<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AuditLog;
use App\Models\DeletedRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class AuditObserver
{
    /**
     * Models that should never be audited (to prevent infinite loops).
     */
    private array $skipModels = [
        AuditLog::class,
        DeletedRecord::class,
    ];

    /**
     * Fields that should never be logged (sensitive data).
     */
    private array $skipFields = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    /**
     * Handle the model "created" event.
     */
    public function created(Model $model): void
    {
        if ($this->shouldSkip($model)) {
            return;
        }

        $this->log($model, 'created', [], $this->filterFields($model->getAttributes()));
    }

    /**
     * Handle the model "updated" event.
     */
    public function updated(Model $model): void
    {
        if ($this->shouldSkip($model)) {
            return;
        }

        $dirty = $model->getDirty();

        // Skip if only password-related fields changed
        $significantChanges = array_diff_key($dirty, array_flip($this->skipFields));
        if (empty($significantChanges)) {
            return;
        }

        $oldValues = [];
        $newValues = [];

        foreach ($significantChanges as $field => $newValue) {
            $oldValues[$field] = $model->getOriginal($field);
            $newValues[$field] = $newValue;
        }

        $this->log($model, 'updated', $oldValues, $newValues);
    }

    /**
     * Handle the model "deleted" event.
     */
    public function deleted(Model $model): void
    {
        if ($this->shouldSkip($model)) {
            return;
        }

        $snapshot = $model->toArray();
        $oldValues = $this->filterFields($snapshot);

        $this->log($model, 'deleted', $oldValues, []);

        // Also create a deleted_records entry with full snapshot
        $this->createDeletedRecord($model, $snapshot);
    }

    /**
     * Handle the model "restored" event.
     */
    public function restored(Model $model): void
    {
        if ($this->shouldSkip($model)) {
            return;
        }

        $this->log($model, 'restored', ['deleted_at' => $model->getOriginal('deleted_at')], ['deleted_at' => null]);
    }

    /**
     * Handle the model "force deleted" event.
     */
    public function forceDeleted(Model $model): void
    {
        if ($this->shouldSkip($model)) {
            return;
        }

        $snapshot = $model->toArray();
        $oldValues = $this->filterFields($snapshot);

        $this->log($model, 'force_deleted', $oldValues, []);
    }

    /**
     * Determine if this model should skip auditing.
     */
    private function shouldSkip(Model $model): bool
    {
        return in_array(get_class($model), $this->skipModels, true);
    }

    /**
     * Filter out sensitive fields from data.
     */
    private function filterFields(array $data): array
    {
        return array_diff_key($data, array_flip($this->skipFields));
    }

    /**
     * Write a log entry to the audit_logs table.
     */
    private function log(Model $model, string $event, array $oldValues, array $newValues): void
    {
        try {
            AuditLog::create([
                'user_id'        => Auth::id(),
                'auditable_type' => get_class($model),
                'auditable_id'   => $model->getKey(),
                'event'          => $event,
                'old_values'     => empty($oldValues) ? null : $oldValues,
                'new_values'     => empty($newValues) ? null : $newValues,
                'ip_address'     => Request::ip(),
                'user_agent'     => Request::userAgent(),
            ]);
        } catch (\Throwable $e) {
            // Silently fail to avoid breaking the main request
            logger()->error('AuditObserver failed to write log', [
                'model'     => get_class($model),
                'model_id'  => $model->getKey(),
                'event'     => $event,
                'exception' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Create a deleted_records entry with the full model snapshot.
     */
    private function createDeletedRecord(Model $model, array $snapshot): void
    {
        try {
            DeletedRecord::create([
                'deletable_type'  => get_class($model),
                'deletable_id'    => $model->getKey(),
                'record_snapshot' => $snapshot,
                'deleted_by'      => Auth::id(),
                'deleted_at'      => now(),
                'deletion_reason' => null,
            ]);
        } catch (\Throwable $e) {
            logger()->error('AuditObserver failed to create deleted_record', [
                'model'     => get_class($model),
                'model_id'  => $model->getKey(),
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
