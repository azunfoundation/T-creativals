<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class NumberSequence extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'entity_type',
        'prefix',
        'current_number',
        'padding_length',
        'format',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'current_number' => 'integer',
            'padding_length' => 'integer',
        ];
    }

    /**
     * Generate the next sequence number for a given entity type.
     *
     * @param string $entityType
     * @return string
     */
    public static function generateNext(string $entityType): string
    {
        return DB::transaction(function () use ($entityType) {
            /** @var NumberSequence|null $sequence */
            $sequence = self::where('entity_type', $entityType)
                ->lockForUpdate()
                ->first();

            if ($sequence === null) {
                $prefixes = [
                    'lead' => 'LEA',
                    'quote' => 'QUO',
                    'invoice' => 'INV',
                    'project' => 'PRJ',
                    'task' => 'TSK',
                    'expense' => 'EXP',
                    'payroll' => 'PAY',
                ];

                $prefix = $prefixes[strtolower($entityType)] ?? strtoupper(substr($entityType, 0, 3));

                $sequence = self::create([
                    'entity_type' => $entityType,
                    'prefix' => $prefix,
                    'current_number' => 0,
                    'padding_length' => 4,
                    'format' => '{PREFIX}-{YEAR}-{NUMBER}',
                ]);
            }

            // Increment sequence number
            $sequence->current_number += 1;
            $sequence->save();

            $year = now()->format('Y');
            $paddedNumber = str_pad((string) $sequence->current_number, $sequence->padding_length, '0', STR_PAD_LEFT);

            return str_replace(
                ['{PREFIX}', '{YEAR}', '{NUMBER}'],
                [$sequence->prefix, $year, $paddedNumber],
                $sequence->format
            );
        });
    }
}
