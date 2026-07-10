<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'lead_number',
        'company_name',
        'website_url',
        'whatsapp_number',
        'city',
        'country',
        'timezone',
        'lead_source_id',
        'stage_id',
        'sales_exec_id',
        'sales_head_id',
        'created_by',
        'priority',
        'temperature',
        'estimated_monthly_budget',
        'expected_start_date',
        'notes',
        'is_converted',
        'converted_client_id',
        'converted_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'estimated_monthly_budget' => 'decimal:2',
            'expected_start_date' => 'date',
            'is_converted' => 'boolean',
            'converted_at' => 'datetime',
            'lead_source_id' => 'integer',
            'stage_id' => 'integer',
            'sales_exec_id' => 'integer',
            'sales_head_id' => 'integer',
            'created_by' => 'integer',
        ];
    }

    /**
     * Boot the model.
     */
    protected static function booted(): void
    {
        static::creating(function (Lead $lead) {
            if (empty($lead->lead_number)) {
                $lead->lead_number = NumberSequence::generateNext('lead');
            }
            if (empty($lead->created_by) && auth()->check()) {
                $lead->created_by = auth()->id();
            }
        });
    }

    /**
     * Get the source that this lead belongs to.
     *
     * @return BelongsTo<LeadSource, $this>
     */
    public function source(): BelongsTo
    {
        return $this->belongsTo(LeadSource::class, 'lead_source_id');
    }

    /**
     * Get the stage that this lead belongs to.
     *
     * @return BelongsTo<LeadStage, $this>
     */
    public function stage(): BelongsTo
    {
        return $this->belongsTo(LeadStage::class, 'stage_id');
    }

    /**
     * Get the sales executive assigned to this lead.
     *
     * @return BelongsTo<User, $this>
     */
    public function salesExec(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sales_exec_id');
    }

    /**
     * Get the sales head assigned to this lead.
     *
     * @return BelongsTo<User, $this>
     */
    public function salesHead(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sales_head_id');
    }

    /**
     * Get the user who created this lead.
     *
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the contacts for this lead.
     *
     * @return HasMany<LeadContact, $this>
     */
    public function contacts(): HasMany
    {
        return $this->hasMany(LeadContact::class, 'lead_id');
    }

    /**
     * Get the activities logged for this lead.
     *
     * @return HasMany<LeadActivity, $this>
     */
    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class, 'lead_id');
    }

    /**
     * Get the followups scheduled for this lead.
     *
     * @return HasMany<LeadFollowup, $this>
     */
    public function followups(): HasMany
    {
        return $this->hasMany(LeadFollowup::class, 'lead_id');
    }

    /**
     * Get the tags for this lead.
     *
     * @return HasMany<LeadTag, $this>
     */
    public function tags(): HasMany
    {
        return $this->hasMany(LeadTag::class, 'lead_id');
    }

    /**
     * Get the services this lead is interested in.
     *
     * @return BelongsToMany<Service, $this>
     */
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'lead_services', 'lead_id', 'service_id')
            ->withTimestamps();
    }
}
