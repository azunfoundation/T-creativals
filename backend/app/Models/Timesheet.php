<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Timesheet extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'task_id',
        'project_id',
        'date',
        'hours_logged',
        'description',
        'is_billable',
        'status',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'task_id' => 'integer',
            'project_id' => 'integer',
            'date' => 'date',
            'hours_logged' => 'decimal:2',
            'is_billable' => 'boolean',
            'approved_by' => 'integer',
            'approved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Timesheet $timesheet) {
            if ($timesheet->isDirty('status') && $timesheet->status === 'approved') {
                if (empty($timesheet->approved_at)) {
                    $timesheet->approved_at = now();
                }
                if (empty($timesheet->approved_by)) {
                    $timesheet->approved_by = auth()->id();
                }
            }
        });
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Task, $this>
     */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * @return BelongsTo<Project, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /**
     * @return HasMany<TimesheetApproval, $this>
     */
    public function approvals(): HasMany
    {
        return $this->hasMany(TimesheetApproval::class);
    }
}
