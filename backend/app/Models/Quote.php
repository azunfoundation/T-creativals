<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Quote extends Model
{
    use SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'quote_number',
        'lead_id',
        'client_id',
        'created_by',
        'title',
        'description',
        'currency_id',
        'exchange_rate',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'total_amount',
        'coupon_id',
        'coupon_discount',
        'status',
        'valid_until',
        'terms_conditions',
        'internal_notes',
        'client_notes',
        'revision_number',
        'parent_quote_id',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'lead_id' => 'integer',
            'client_id' => 'integer',
            'created_by' => 'integer',
            'currency_id' => 'integer',
            'coupon_id' => 'integer',
            'parent_quote_id' => 'integer',
            'exchange_rate' => 'decimal:4',
            'subtotal' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'coupon_discount' => 'decimal:2',
            'revision_number' => 'integer',
            'valid_until' => 'date',
        ];
    }

    /**
     * Boot the model.
     */
    protected static function booted(): void
    {
        static::creating(function (Quote $quote) {
            if (empty($quote->quote_number)) {
                $quote->quote_number = NumberSequence::generateNext('quote');
            }
        });
    }

    /**
     * Get the lead that this quote belongs to.
     *
     * @return BelongsTo<Lead, $this>
     */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /**
     * Get the client that this quote belongs to.
     *
     * @return BelongsTo<User, $this>
     */
    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    /**
     * Get the user who created this quote.
     *
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the currency for the quote.
     *
     * @return BelongsTo<Currency, $this>
     */
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'currency_id');
    }

    /**
     * Get the discount coupon applied to this quote.
     *
     * @return BelongsTo<DiscountCoupon, $this>
     */
    public function coupon(): BelongsTo
    {
        return $this->belongsTo(DiscountCoupon::class, 'coupon_id');
    }

    /**
     * Get the items belonging to this quote.
     *
     * @return HasMany<QuoteItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'quote_id');
    }

    /**
     * Get the approvals belonging to this quote.
     *
     * @return HasMany<QuoteApproval, $this>
     */
    public function approvals(): HasMany
    {
        return $this->hasMany(QuoteApproval::class, 'quote_id');
    }
}
