<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NumberSequenceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();

        $sequences = [
            [
                'entity_type'    => 'lead',
                'prefix'         => 'LEAD',
                'format'         => 'LEAD-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                'entity_type'    => 'quote',
                'prefix'         => 'QT',
                'format'         => 'QT-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                'entity_type'    => 'invoice',
                'prefix'         => 'INV',
                'format'         => 'INV-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                'entity_type'    => 'project',
                'prefix'         => 'PRJ',
                'format'         => 'PRJ-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                'entity_type'    => 'task',
                'prefix'         => 'TSK',
                'format'         => 'TSK-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                'entity_type'    => 'expense',
                'prefix'         => 'EXP',
                'format'         => 'EXP-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                'entity_type'    => 'payroll',
                'prefix'         => 'PAY',
                'format'         => 'PAY-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
            [
                // Payment::boot() calls NumberSequence::generateNext('payment') on every
                // recorded payment, but this entity type was never seeded — it would
                // silently auto-create itself on first use with a fallback prefix
                // ('PAY', colliding cosmetically with payroll) and stay invisible on the
                // Number Sequences settings page until then.
                'entity_type'    => 'payment',
                'prefix'         => 'RCPT',
                'format'         => 'RCPT-{YEAR}-{NUMBER}',
                'padding_length' => 4,
                'current_number' => 0,
            ],
        ];

        foreach ($sequences as &$sequence) {
            $sequence['created_at'] = $now;
            $sequence['updated_at'] = $now;
        }
        unset($sequence);

        // upsert on 'entity_type' so re-seeding does not duplicate rows
        DB::table('number_sequences')->upsert(
            $sequences,
            ['entity_type'],
            ['prefix', 'format', 'padding_length', 'updated_at']
            // current_number intentionally excluded so live data is not reset on re-seed
        );

        $this->command->info('✅ Number sequences seeded: lead, quote, invoice, project, task, expense, payroll.');
    }
}
