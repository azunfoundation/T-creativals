<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeletedRecord extends Model
{
    protected $table = 'deleted_records';

    protected $fillable = [
        'deletable_type',
        'deletable_id',
        'deleted_by',
        'restored_by',
        'record_snapshot',
        'deleted_at',
        'restored_at',
        'restore_reason',
    ];

    protected function casts(): array
    {
        return [
            'record_snapshot' => 'array',
            'deleted_at'      => 'datetime',
            'restored_at'     => 'datetime',
        ];
    }

    public function deletedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function restoredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'restored_by');
    }

    public function deletable()
    {
        return $this->morphTo('deletable');
    }
}
