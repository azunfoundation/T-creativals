<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskTemplateItem extends Model
{
    protected $fillable = [
        'template_id',
        'title',
        'description',
        'estimated_hours',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'template_id' => 'integer',
            'estimated_hours' => 'decimal:2',
            'sort_order' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<TaskTemplate, $this>
     */
    public function template(): BelongsTo
    {
        return $this->belongsTo(TaskTemplate::class, 'template_id');
    }
}
