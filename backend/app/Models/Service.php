<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Service extends Model
{
    use SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'category_id',
        'name',
        'slug',
        'description',
        'default_price',
        'currency_id',
        'billing_type',
        'unit',
        'is_active',
        'is_taxable',
        'tax_rate',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'category_id' => 'integer',
            'currency_id' => 'integer',
            'default_price' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'is_active' => 'boolean',
            'is_taxable' => 'boolean',
        ];
    }

    /**
     * Get the category that owns the service.
     *
     * @return BelongsTo<ServiceCategory, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ServiceCategory::class, 'category_id');
    }

    /**
     * Get the currency for the service.
     *
     * @return BelongsTo<Currency, $this>
     */
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'currency_id');
    }

    /**
     * Get the leads interested in this service (Sprint 2 compatibility).
     *
     * @return BelongsToMany<Lead, $this>
     */
    public function leads(): BelongsToMany
    {
        return $this->belongsToMany(Lead::class, 'lead_services', 'service_id', 'lead_id');
    }

    /**
     * Get the package services pivot records.
     *
     * @return HasMany<PackageService, $this>
     */
    public function packageServices(): HasMany
    {
        return $this->hasMany(PackageService::class, 'service_id');
    }

    /**
     * Get the packages containing this service.
     *
     * @return BelongsToMany<Package, $this>
     */
    public function packages(): BelongsToMany
    {
        return $this->belongsToMany(Package::class, 'package_services')
            ->using(PackageService::class)
            ->withPivot(['custom_price', 'quantity', 'description'])
            ->withTimestamps();
    }
}
