<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, HasRoles;

    /**
     * All roles and permissions in this application are defined on the `web`
     * guard (see RolesPermissionsSeeder). Without pinning this, Spatie resolves
     * the guard from the current request (`sanctum` for API calls), causing
     * "There is no role named `x` for guard `sanctum`" errors on assignment.
     */
    protected $guard_name = 'web';

    protected $fillable = [
        'name',
        'email',
        'password',
        'avatar_url',
        'phone',
        'employee_id',
        'status',
        'last_login_at',
        'last_login_ip',
        'is_client_portal_user',
        'must_change_password',
        // Client-account billing fields (PRD client spec) — staff rows leave
        // these null.
        'company_name',
        'billing_address',
        'tax_number',
        'default_currency_id',
        'workspace_preferences',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at'     => 'datetime',
            'password'          => 'hashed',
            'is_client_portal_user' => 'boolean',
            'must_change_password'  => 'boolean',
            'workspace_preferences' => 'array',
        ];
    }

    // ─── Relationships ────────────────────────────────────────

    public function departments(): BelongsToMany
    {
        return $this->belongsToMany(Department::class, 'user_departments')
            ->withPivot('is_primary')
            ->withTimestamps();
    }

    public function primaryDepartment(): ?Department
    {
        return $this->departments()->wherePivot('is_primary', true)->first();
    }

    public function managers(): BelongsToMany
    {
        return $this->belongsToMany(
            User::class,
            'manager_relationships',
            'employee_id',
            'manager_id'
        )->withPivot('relationship_type', 'is_primary')->withTimestamps();
    }

    public function subordinates(): BelongsToMany
    {
        return $this->belongsToMany(
            User::class,
            'manager_relationships',
            'manager_id',
            'employee_id'
        )->withPivot('relationship_type', 'is_primary')->withTimestamps();
    }

    public function loginActivities(): HasMany
    {
        return $this->hasMany(LoginActivity::class);
    }

    public function timesheets(): HasMany
    {
        return $this->hasMany(Timesheet::class);
    }

    public function compensation(): HasOne
    {
        return $this->hasOne(EmployeeCompensation::class)->where('is_current', true);
    }

    /** Contact persons on a client account (users with the `client` role). */
    public function clientContacts(): HasMany
    {
        return $this->hasMany(ClientContact::class, 'client_id');
    }

    public function defaultCurrency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'default_currency_id');
    }

    // ─── Scopes ──────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeNonPortal($query)
    {
        return $query->where('is_client_portal_user', false);
    }

    // ─── Helpers ─────────────────────────────────────────────

    public function isFounder(): bool
    {
        return $this->hasRole('founder');
    }

    public function getHourlyRateAttribute(): float
    {
        $comp = $this->compensation;
        if (!$comp) {
            return 0.00;
        }

        $hourlyRate = (float) $comp->hourly_rate;
        if ($hourlyRate > 0) {
            return $hourlyRate;
        }

        $expectedHours = (float) $comp->expected_monthly_hours;
        if ($expectedHours > 0) {
            return (float) ($comp->base_amount / $expectedHours);
        }

        return 0.00;
    }
}
