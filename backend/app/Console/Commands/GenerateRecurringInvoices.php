<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\RecurringBillingRule;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class GenerateRecurringInvoices extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'creativals:generate-recurring-invoices';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate invoices from active recurring billing rules that are due';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $today = Carbon::today();
        
        $this->info("Starting recurring invoice generation for: " . $today->toDateString());

        $rules = RecurringBillingRule::where('status', 'active')
            ->where('next_generation_date', '<=', $today)
            ->where('start_date', '<=', $today)
            ->where(function ($query) use ($today) {
                $query->whereNull('end_date')
                      ->orWhere('end_date', '>=', $today);
            })
            ->with('items')
            ->get();

        if ($rules->isEmpty()) {
            $this->info("No recurring billing rules are due for generation today.");
            return Command::SUCCESS;
        }

        $generatedCount = 0;

        foreach ($rules as $rule) {
            try {
                DB::transaction(function () use ($rule, $today) {
                    // Create invoice
                    $invoice = Invoice::create([
                        'client_id' => $rule->client_id,
                        'created_by' => $rule->created_by,
                        'recurring_rule_id' => $rule->id,
                        'title' => $rule->name . ' - ' . now()->format('M Y'),
                        'description' => 'Automatically generated invoice from recurring rule: ' . $rule->name,
                        'currency_id' => $rule->currency_id,
                        'base_currency' => $rule->base_currency ?? 'INR',
                        'exchange_rate' => $rule->exchange_rate,
                        'subtotal' => $rule->subtotal,
                        'discount_amount' => $rule->discount_amount,
                        'tax_amount' => $rule->tax_amount,
                        'total_amount' => $rule->total_amount,
                        'coupon_id' => $rule->coupon_id,
                        'coupon_discount' => $rule->coupon_discount,
                        'paid_amount' => 0.00,
                        'due_amount' => $rule->total_amount,
                        'status' => 'draft',
                        'issue_date' => $today->toDateString(),
                        'due_date' => $today->copy()->addDays(15)->toDateString(),
                        'terms_conditions' => $rule->terms_conditions,
                        'client_notes' => $rule->client_notes,
                        'internal_notes' => $rule->internal_notes,
                    ]);

                    // Copy items
                    foreach ($rule->items as $item) {
                        $invoice->items()->create([
                            'service_id' => $item->service_id,
                            'description' => $item->description,
                            'quantity' => $item->quantity,
                            'unit' => $item->unit,
                            'unit_price' => $item->unit_price,
                            'tax_type' => $item->tax_type ?? 'none',
                            'discount_percent' => $item->discount_percent,
                            'discount_amount' => $item->discount_amount,
                            'tax_rate' => $item->tax_rate,
                            'tax_amount' => $item->tax_amount,
                            'total_amount' => $item->total_amount,
                            'sort_order' => $item->sort_order,
                        ]);
                    }

                    // Calculate next generation date
                    $nextGen = Carbon::parse($rule->next_generation_date ?: $today);
                    switch ($rule->frequency) {
                        case 'daily':
                            $nextGen->addDay();
                            break;
                        case 'weekly':
                            $nextGen->addWeek();
                            break;
                        case 'bi_weekly':
                            $nextGen->addWeeks(2);
                            break;
                        case 'monthly':
                            $nextGen->addMonth();
                            break;
                        case 'quarterly':
                            $nextGen->addMonths(3);
                            break;
                        case 'half_yearly':
                            $nextGen->addMonths(6);
                            break;
                        case 'yearly':
                            $nextGen->addYear();
                            break;
                    }

                    $updateData = [
                        'last_generated_at' => now(),
                    ];

                    if ($rule->end_date && $nextGen->greaterThan($rule->end_date)) {
                        $updateData['next_generation_date'] = null;
                        $updateData['status'] = 'inactive';
                    } else {
                        $updateData['next_generation_date'] = $nextGen->toDateString();
                    }

                    $rule->update($updateData);
                });

                $generatedCount++;
                $this->line("Generated invoice from rule: {$rule->name} (Rule ID: {$rule->id})");

            } catch (\Throwable $e) {
                $this->error("Failed to generate invoice for rule ID {$rule->id}: {$e->getMessage()}");
            }
        }

        $this->info("Completed! Generated {$generatedCount} recurring invoices.");
        return Command::SUCCESS;
    }
}
