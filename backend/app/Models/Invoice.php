<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'invoice_number',
        'quote_id',
        'client_id',
        'created_by',
        'recurring_rule_id',
        'title',
        'description',
        'currency_id',
        'base_currency',
        'exchange_rate',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'total_amount',
        'coupon_id',
        'coupon_discount',
        'paid_amount',
        'due_amount',
        'status',
        'issue_date',
        'due_date',
        'terms_conditions',
        'client_notes',
        'internal_notes',
        'is_recurring',
        'recurring_interval',
        'recurring_end_date',
        'last_recurring_date',
        'parent_invoice_id',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'quote_id' => 'integer',
            'client_id' => 'integer',
            'created_by' => 'integer',
            'recurring_rule_id' => 'integer',
            'currency_id' => 'integer',
            'base_currency' => 'string',
            'coupon_id' => 'integer',
            'exchange_rate' => 'decimal:4',
            'subtotal' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'coupon_discount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'due_amount' => 'decimal:2',
            'issue_date' => 'date',
            'due_date' => 'date',
            'is_recurring' => 'boolean',
            'recurring_end_date' => 'date',
            'last_recurring_date' => 'date',
            'parent_invoice_id' => 'integer',
        ];
    }

    /**
     * Boot the model.
     */
    protected static function booted(): void
    {
        static::creating(function (Invoice $invoice) {
            if (empty($invoice->invoice_number)) {
                $invoice->invoice_number = NumberSequence::generateNext('invoice');
            }
        });
    }

    /**
     * Get the items belonging to this invoice.
     *
     * @return HasMany<InvoiceItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class, 'invoice_id');
    }

    /**
     * Get the payments recorded for this invoice.
     *
     * @return HasMany<Payment, $this>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    /**
     * Get the quote associated with this invoice.
     *
     * @return BelongsTo<Quote, $this>
     */
    public function quote(): BelongsTo
    {
        return $this->belongsTo(Quote::class, 'quote_id');
    }

    /**
     * Get the client.
     *
     * @return BelongsTo<User, $this>
     */
    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    /**
     * Get the creator.
     *
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the recurring billing rule.
     *
     * @return BelongsTo<RecurringBillingRule, $this>
     */
    public function recurringRule(): BelongsTo
    {
        return $this->belongsTo(RecurringBillingRule::class, 'recurring_rule_id');
    }

    /**
     * Get the currency.
     *
     * @return BelongsTo<Currency, $this>
     */
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'currency_id');
    }

    /**
     * Get the coupon.
     *
     * @return BelongsTo<DiscountCoupon, $this>
     */
    public function coupon(): BelongsTo
    {
        return $this->belongsTo(DiscountCoupon::class, 'coupon_id');
    }

    /**
     * Get the approvals for the invoice.
     */
    public function approvals(): HasMany
    {
        return $this->hasMany(InvoiceApproval::class, 'invoice_id');
    }

    /**
     * Get the projects generated from this invoice.
     */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class, 'invoice_id');
    }

    /**
     * Get the parent invoice if this was generated from a recurring invoice.
     */
    public function parentInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'parent_invoice_id');
    }

    /**
     * Get the child invoices generated from this recurring invoice.
     */
    public function childInvoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'parent_invoice_id');
    }

    /**
     * Get credit notes for this invoice.
     */
    public function creditNotes(): HasMany
    {
        return $this->hasMany(CreditNote::class, 'invoice_id');
    }

    /**
     * Recalculate totals and status for the invoice.
     */
    public function recalculateTotals(): void
    {
        $subtotal = (float) $this->subtotal;
        $discountAmount = (float) $this->discount_amount;
        $taxAmount = (float) $this->tax_amount;
        $totalAmount = (float) $this->total_amount;
        $couponDiscount = (float) $this->coupon_discount;

        if ($this->items()->count() > 0) {
            $subtotal = 0.00;
            $itemsDiscount = 0.00;
            $itemsTax = 0.00;

            foreach ($this->items as $item) {
                $qty = (float) $item->quantity;
                $price = (float) $item->unit_price;
                $discPercent = (float) $item->discount_percent;
                $taxRate = $item->tax_type === 'none' ? 0.00 : (float) $item->tax_rate;

                $itemSubtotal = $qty * $price;
                $itemDiscount = $itemSubtotal * ($discPercent / 100);
                $itemTaxable = $itemSubtotal - $itemDiscount;
                $itemTax = $itemTaxable * ($taxRate / 100);
                $itemTotal = $itemTaxable + $itemTax;

                if (abs((float)$item->discount_amount - $itemDiscount) > 0.0001 ||
                    abs((float)$item->tax_amount - $itemTax) > 0.0001 ||
                    abs((float)$item->total_amount - $itemTotal) > 0.0001 ||
                    abs((float)$item->tax_rate - $taxRate) > 0.0001) {
                    $item->update([
                        'discount_amount' => $itemDiscount,
                        'tax_rate' => $taxRate,
                        'tax_amount' => $itemTax,
                        'total_amount' => $itemTotal,
                    ]);
                }

                $subtotal += $itemSubtotal;
                $itemsDiscount += $itemDiscount;
                $itemsTax += $itemTax;
            }

            $couponDiscount = 0.00;
            if ($this->coupon && $this->coupon->isValidForAmount($subtotal - $itemsDiscount)) {
                if ($this->coupon->type === 'percentage') {
                    $couponDiscount = ($subtotal - $itemsDiscount) * ((float) $this->coupon->value / 100);
                    if ($this->coupon->maximum_discount !== null && $couponDiscount > (float) $this->coupon->maximum_discount) {
                        $couponDiscount = (float) $this->coupon->maximum_discount;
                    }
                } else {
                    $couponDiscount = (float) $this->coupon->value;
                    if ($couponDiscount > ($subtotal - $itemsDiscount)) {
                        $couponDiscount = $subtotal - $itemsDiscount;
                    }
                }
            }

            $discountAmount = $itemsDiscount + $couponDiscount;
            $taxAmount = $itemsTax;
            $totalAmount = $subtotal - $discountAmount + $taxAmount;
        }

        $paidAmount = (float) $this->payments()->sum('amount');
        $dueAmount = $totalAmount - $paidAmount;

        // Ensure we don't end up with tiny negative values due to floating point precision
        if ($dueAmount < 0.005) {
            $dueAmount = 0.00;
        }

        $status = $this->status;
        if (!in_array($status, ['draft', 'pending_review', 'pending_approval', 'approved', 'void', 'cancelled'], true)) {
            if ($paidAmount >= $totalAmount) {
                $status = 'paid';
            } elseif ($paidAmount > 0) {
                $status = 'partially_paid';
            } else {
                if ($this->due_date && $this->due_date->isPast()) {
                    $status = 'overdue';
                } else {
                    $status = 'sent';
                }
            }
        }

        $this->forceFill([
            'subtotal' => $subtotal,
            'discount_amount' => $discountAmount,
            'tax_amount' => $taxAmount,
            'total_amount' => $totalAmount,
            'coupon_discount' => $couponDiscount,
            'paid_amount' => $paidAmount,
            'due_amount' => $dueAmount,
            'status' => $status,
        ])->saveQuietly();
    }
}
