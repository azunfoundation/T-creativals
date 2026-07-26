<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientCredential extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'client_credentials';

    protected $fillable = [
        'is_favorite',
        'is_archived',
        'client_name',
        'client_id',
        'platform',
        'credential_type',
        'username',
        'password',
        'login_url',
        'notes',
        'tags',
        'last_used_at',
    ];

    protected $casts = [
        'is_favorite' => 'boolean',
        'is_archived' => 'boolean',
        'password' => 'encrypted',
        'last_used_at' => 'datetime',
    ];

    /**
     * Relationship with the Client user.
     */
    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id')->whereHas('roles', function ($query) {
            $query->where('name', 'client');
        });
    }

    /**
     * Scope to filter out archived credentials.
     */
    public function scopeActive($query)
    {
        return $query->where('is_archived', false);
    }
}
