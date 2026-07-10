<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecurringBillingRuleItem extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'recurring_billing_rule_id',
        'service_id',
        'description',
        'quantity',
        'unit',
        'unit_price',
        'tax_type',
        'discount_percent',
        'discount_amount',
        'tax_rate',
        'tax_amount',
        'total_amount',
        'sort_order',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'recurring_billing_rule_id' => 'integer',
            'service_id' => 'integer',
            'quantity' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'tax_type' => 'string',
            'discount_percent' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'sort_order' => 'integer',
        ];
    }

    /**
     * Get the rule that this item belongs to.
     *
     * @return BelongsTo<RecurringBillingRule, $this>
     */
    public function rule(): BelongsTo
    {
        return $this->belongsTo(RecurringBillingRule::class, 'recurring_billing_rule_id');
    }

    /**
     * Get the service.
     *
     * @return BelongsTo<Service, $this>
     */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_id');
    }
}
