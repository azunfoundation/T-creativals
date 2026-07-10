<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Project extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'project_number',
        'name',
        'description',
        'client_id',
        'invoice_id',
        'manager_id',
        'status',
        'start_date',
        'end_date',
        'budget_hours',
        'budget_amount',
        'completion_percentage',
        'is_recurring',
    ];

    protected function casts(): array
    {
        return [
            'client_id'             => 'integer',
            'invoice_id'            => 'integer',
            'manager_id'            => 'integer',
            'budget_hours'          => 'decimal:2',
            'budget_amount'         => 'decimal:2',
            'completion_percentage' => 'integer',
            'is_recurring'          => 'boolean',
            'start_date'            => 'date',
            'end_date'              => 'date',
        ];
    }

    /**
     * Auto-generate project_number on creation.
     */
    protected static function booted(): void
    {
        static::creating(function (Project $project) {
            if (empty($project->project_number)) {
                $project->project_number = NumberSequence::generateNext('project');
            }
        });
    }

    // ─── Relationships ────────────────────────────────────────

    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /**
     * @return HasMany<ProjectMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    /**
     * @return HasMany<Milestone, $this>
     */
    public function milestones(): HasMany
    {
        return $this->hasMany(Milestone::class);
    }

    /**
     * @return HasMany<Task, $this>
     */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    /**
     * @return HasMany<Timesheet, $this>
     */
    public function timesheets(): HasMany
    {
        return $this->hasMany(Timesheet::class);
    }

    /**
     * @return HasMany<\App\Models\Expense, $this>
     */
    public function expenses(): HasMany
    {
        return $this->hasMany(\App\Models\Expense::class);
    }

    /**
     * @return BelongsToMany<Department, $this>
     */
    public function departments(): BelongsToMany
    {
        return $this->belongsToMany(Department::class, 'project_departments')
            ->withPivot('lead_user_id')
            ->withTimestamps();
    }

    /**
     * @return HasMany<ProjectDocument, $this>
     */
    public function documents(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ProjectDocument::class);
    }
}
