<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CompensationType extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'type', // fixed, hourly, hybrid
        'description',
    ];

    public function employeeCompensations(): HasMany
    {
        return $this->hasMany(EmployeeCompensation::class);
    }
}
