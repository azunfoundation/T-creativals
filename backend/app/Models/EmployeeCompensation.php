<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeCompensation extends Model
{
    use HasFactory;

    protected $table = 'employee_compensations';

    protected $fillable = [
        'user_id',
        'compensation_type_id',
        'base_amount',
        'currency_id',
        'expected_monthly_hours',
        'hourly_rate',
        'effective_from',
        'effective_until',
        'is_current',
        'notes',
        'tds_percent',
        'pf_percent',
        'esi_percent',
    ];

    protected function casts(): array
    {
        return [
            'base_amount' => 'decimal:2',
            'expected_monthly_hours' => 'decimal:2',
            'hourly_rate' => 'decimal:2',
            'effective_from' => 'date',
            'effective_until' => 'date',
            'is_current' => 'boolean',
            'tds_percent' => 'decimal:2',
            'pf_percent' => 'decimal:2',
            'esi_percent' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function compensationType(): BelongsTo
    {
        return $this->belongsTo(CompensationType::class);
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }
}
