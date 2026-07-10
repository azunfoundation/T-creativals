<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Currency extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'code',
        'name',
        'symbol',
        'exchange_rate_to_inr',
        'is_active',
        'is_default',
        'rate_updated_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'exchange_rate_to_inr' => 'decimal:4',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
            'rate_updated_at' => 'datetime',
        ];
    }
}
