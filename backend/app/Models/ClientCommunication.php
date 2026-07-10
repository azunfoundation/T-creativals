<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientCommunication extends Model
{
    protected $fillable = [
        'client_id',
        'recorded_by',
        'type',
        'subject',
        'content',
        'communication_date',
    ];

    protected function casts(): array
    {
        return [
            'client_id' => 'integer',
            'recorded_by' => 'integer',
            'communication_date' => 'datetime',
        ];
    }

    /**
     * Get the client associated with the communication.
     * 
     * @return BelongsTo<User, $this>
     */
    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    /**
     * Get the user (employee) who recorded the communication.
     * 
     * @return BelongsTo<User, $this>
     */
    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
