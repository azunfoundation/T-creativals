<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\LeadSource;
use App\Models\LeadStage;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class LeadSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Ensure services exist
        $currencyId = DB::table('currencies')->where('code', 'INR')->value('id') 
            ?? DB::table('currencies')->value('id') 
            ?? 1;

        $serviceData = [
            [
                'name' => 'Web Development', 
                'slug' => 'web-development', 
                'is_active' => true,
                'default_price' => 50000.00,
                'currency_id' => $currencyId,
                'billing_type' => 'fixed',
                'unit' => 'project',
            ],
            [
                'name' => 'UI/UX Design', 
                'slug' => 'ui-ux-design', 
                'is_active' => true,
                'default_price' => 30000.00,
                'currency_id' => $currencyId,
                'billing_type' => 'fixed',
                'unit' => 'project',
            ],
            [
                'name' => 'Mobile App Development', 
                'slug' => 'mobile-app-development', 
                'is_active' => true,
                'default_price' => 80000.00,
                'currency_id' => $currencyId,
                'billing_type' => 'fixed',
                'unit' => 'project',
            ],
        ];

        foreach ($serviceData as $srv) {
            Service::firstOrCreate(['slug' => $srv['slug']], $srv);
        }

        // Retrieve database elements
        $arun = User::where('email', 'sales@creativals.com')->first();
        $sneha = User::where('email', 'pm@creativals.com')->first();
        $vikram = User::where('email', 'dev@creativals.com')->first();
        $founder = User::where('email', 'founder@creativals.com')->first();

        $creatorId = $founder?->id ?? 1;
        $arunId = $arun?->id ?? 1;
        $snehaId = $sneha?->id ?? 1;
        $vikramId = $vikram?->id ?? 1;

        $stages = LeadStage::pluck('id', 'slug');
        $sources = LeadSource::pluck('id', 'slug');
        $services = Service::pluck('id', 'slug');

        // Lead 1: Acme Corp
        DB::transaction(function () use ($stages, $sources, $services, $arunId, $vikramId, $creatorId) {
            /** @var Lead $lead */
            $lead = Lead::create([
                'company_name' => 'Acme Corp',
                'website_url' => 'https://acme.com',
                'whatsapp_number' => '+15551234',
                'city' => 'San Jose',
                'country' => 'USA',
                'timezone' => 'America/Los_Angeles',
                'lead_source_id' => $sources['website'] ?? null,
                'stage_id' => $stages['fresh-lead'] ?? null,
                'sales_exec_id' => $vikramId,
                'sales_head_id' => $arunId,
                'created_by' => $creatorId,
                'priority' => 'high',
                'temperature' => 'warm',
                'estimated_monthly_budget' => 5000.00,
                'expected_start_date' => now()->addDays(15),
                'notes' => 'Interested in full website redesign.',
            ]);

            $lead->contacts()->create([
                'name' => 'John Doe',
                'designation' => 'CTO',
                'email' => 'john@acme.com',
                'phone' => '+15551234',
                'whatsapp' => '+15551234',
                'notes' => 'Primary tech decision maker.',
                'is_primary' => true,
            ]);

            if (isset($services['web-development'])) {
                $lead->services()->attach($services['web-development']);
            }
            if (isset($services['ui-ux-design'])) {
                $lead->services()->attach($services['ui-ux-design']);
            }

            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $vikramId,
                'type' => 'phone_call',
                'description' => 'Initial discovery call conducted by Vikram. Discussed overall scope.',
                'occurred_at' => now()->subDay(),
            ]);

            LeadFollowup::create([
                'lead_id' => $lead->id,
                'assigned_to' => $vikramId,
                'created_by' => $vikramId,
                'description' => 'Follow up on redesign proposal and scope document',
                'type' => 'call',
                'scheduled_at' => now()->addDays(2),
                'is_completed' => false,
            ]);
        });

        // Lead 2: Globex Corporation
        DB::transaction(function () use ($stages, $sources, $services, $arunId, $snehaId, $creatorId) {
            /** @var Lead $lead */
            $lead = Lead::create([
                'company_name' => 'Globex Corporation',
                'website_url' => 'https://globex.com',
                'whatsapp_number' => '+15559876',
                'city' => 'Boston',
                'country' => 'USA',
                'timezone' => 'America/New_York',
                'lead_source_id' => $sources['linkedin'] ?? null,
                'stage_id' => $stages['hot-lead'] ?? null,
                'sales_exec_id' => $snehaId,
                'sales_head_id' => $arunId,
                'created_by' => $creatorId,
                'priority' => 'urgent',
                'temperature' => 'hot',
                'estimated_monthly_budget' => 12000.00,
                'expected_start_date' => now()->addDays(7),
                'notes' => 'Wants to build a cross-platform mobile application.',
            ]);

            $lead->contacts()->create([
                'name' => 'Jane Smith',
                'designation' => 'Product Director',
                'email' => 'jane@globex.com',
                'phone' => '+15559876',
                'whatsapp' => '+15559876',
                'notes' => 'Very keen to start next week.',
                'is_primary' => true,
            ]);

            if (isset($services['mobile-app-development'])) {
                $lead->services()->attach($services['mobile-app-development']);
            }
            if (isset($services['ui-ux-design'])) {
                $lead->services()->attach($services['ui-ux-design']);
            }

            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $snehaId,
                'type' => 'meeting',
                'description' => 'Detailed architecture requirements workshop completed.',
                'occurred_at' => now()->subHours(2),
            ]);

            LeadFollowup::create([
                'lead_id' => $lead->id,
                'assigned_to' => $snehaId,
                'created_by' => $snehaId,
                'description' => 'Send over mobile app timeline estimate and pricing',
                'type' => 'email',
                'scheduled_at' => now()->addDay(),
                'is_completed' => false,
            ]);
        });

        // Lead 3: Initech Systems
        DB::transaction(function () use ($stages, $sources, $services, $arunId, $vikramId, $creatorId) {
            /** @var Lead $lead */
            $lead = Lead::create([
                'company_name' => 'Initech Systems',
                'website_url' => 'https://initech.com',
                'whatsapp_number' => '+15554321',
                'city' => 'Austin',
                'country' => 'USA',
                'timezone' => 'America/Chicago',
                'lead_source_id' => $sources['referral'] ?? null,
                'stage_id' => $stages['quote-sent'] ?? null,
                'sales_exec_id' => $vikramId,
                'sales_head_id' => $arunId,
                'created_by' => $creatorId,
                'priority' => 'medium',
                'temperature' => 'warm',
                'estimated_monthly_budget' => 8500.00,
                'expected_start_date' => now()->addDays(30),
                'notes' => 'Requires custom backend CRM system integration.',
            ]);

            $lead->contacts()->create([
                'name' => 'Peter Gibbons',
                'designation' => 'Manager',
                'email' => 'peter@initech.com',
                'phone' => '+15554321',
                'whatsapp' => '+15554321',
                'notes' => 'Referred by Bob Slydell.',
                'is_primary' => true,
            ]);

            if (isset($services['web-development'])) {
                $lead->services()->attach($services['web-development']);
            }

            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $vikramId,
                'type' => 'proposal_sent',
                'description' => 'Sent backend CRM system design proposal with quote.',
                'occurred_at' => now()->subDays(3),
            ]);

            LeadFollowup::create([
                'lead_id' => $lead->id,
                'assigned_to' => $vikramId,
                'created_by' => $vikramId,
                'description' => 'Quote review meeting with Peter and team',
                'type' => 'meeting',
                'scheduled_at' => now()->addDays(3),
                'is_completed' => false,
            ]);
        });
    }
}
