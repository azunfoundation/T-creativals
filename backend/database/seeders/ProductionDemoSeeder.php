<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Carbon\Carbon;
use App\Models\User;
use App\Models\Department;
use App\Models\Currency;
use App\Models\ServiceCategory;
use App\Models\Service;
use App\Models\Package;
use App\Models\DiscountCoupon;
use App\Models\Lead;
use App\Models\LeadStage;
use App\Models\LeadSource;
use App\Models\LeadContact;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\Quote;
use App\Models\QuoteItem;
use App\Models\QuoteApproval;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\Milestone;
use App\Models\Task;
use App\Models\Timesheet;
use App\Models\TimesheetApproval;
use App\Models\CompensationType;
use App\Models\EmployeeCompensation;
use App\Models\PayrollRun;
use App\Models\PayrollRunItem;
use App\Models\PayrollAdjustment;
use App\Models\Bonus;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Vendor;
use App\Models\NumberSequence;

class ProductionDemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->command->info('🧹 Truncating old operational tables...');

        DB::statement('PRAGMA foreign_keys = OFF;');
        
        DB::table('payments')->delete();
        DB::table('invoice_items')->delete();
        DB::table('invoice_approvals')->delete();
        DB::table('invoices')->delete();
        DB::table('quote_approvals')->delete();
        DB::table('quote_items')->delete();
        DB::table('quotes')->delete();
        DB::table('timesheet_approvals')->delete();
        DB::table('timesheets')->delete();
        DB::table('task_comments')->delete();
        DB::table('task_attachments')->delete();
        DB::table('task_dependencies')->delete();
        DB::table('tasks')->delete();
        DB::table('milestones')->delete();
        DB::table('project_members')->delete();
        DB::table('project_departments')->delete();
        DB::table('projects')->delete();
        DB::table('lead_activities')->delete();
        DB::table('lead_followups')->delete();
        DB::table('lead_contacts')->delete();
        DB::table('lead_services')->delete();
        DB::table('leads')->delete();
        DB::table('employee_compensations')->delete();
        DB::table('bonuses')->delete();
        DB::table('payroll_adjustments')->delete();
        DB::table('payroll_run_items')->delete();
        DB::table('payroll_runs')->delete();
        DB::table('expenses')->delete();
        DB::table('vendors')->delete();
        DB::table('discount_coupons')->delete();
        DB::table('package_services')->delete();
        DB::table('packages')->delete();
        DB::table('services')->delete();

        // Clear all users except model roles
        DB::table('model_has_roles')->where('model_type', User::class)->delete();
        DB::table('model_has_permissions')->where('model_type', User::class)->delete();
        DB::table('users')->delete();

        // Reset number sequences to clean start
        DB::table('number_sequences')->update(['current_number' => 0]);

        DB::statement('PRAGMA foreign_keys = ON;');

        $this->command->info('👥 Creating demo staff and clients...');

        $departments = Department::pluck('id', 'slug')->toArray();
        if (empty($departments)) {
            $this->call(DepartmentSeeder::class);
            $departments = Department::pluck('id', 'slug')->toArray();
        }

        $inr = Currency::where('code', 'INR')->first() ?? Currency::create([
            'code' => 'INR', 'symbol' => '₹', 'name' => 'Indian Rupee', 'exchange_rate' => 1.0000, 'is_active' => true
        ]);
        $usd = Currency::where('code', 'USD')->first() ?? Currency::create([
            'code' => 'USD', 'symbol' => '$', 'name' => 'US Dollar', 'exchange_rate' => 75.0000, 'is_active' => true
        ]);

        // 1. Founder
        $founder = User::create([
            'name' => 'Rajesh Kumar',
            'email' => 'founder@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543210',
        ]);
        $founder->assignRole('founder');

        // 2. Director
        $director = User::create([
            'name' => 'Priya Sharma',
            'email' => 'director@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543211',
        ]);
        $director->assignRole('director');
        $director->departments()->sync([$departments['sales'] => ['is_primary' => true]]);

        // 3. Sales Head
        $salesHead = User::create([
            'name' => 'Arun Mehta',
            'email' => 'sales@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543212',
        ]);
        $salesHead->assignRole('sales_head');
        $salesHead->departments()->sync([$departments['sales'] => ['is_primary' => true]]);

        // 4. Sales Executives
        $salesExec1 = User::create([
            'name' => 'Sneha Patel',
            'email' => 'sales_exec1@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543213',
        ]);
        $salesExec1->assignRole('sales_exec');
        $salesExec1->departments()->sync([$departments['sales'] => ['is_primary' => true]]);

        $salesExec2 = User::create([
            'name' => 'Vikram Singh',
            'email' => 'sales_exec2@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543214',
        ]);
        $salesExec2->assignRole('sales_exec');
        $salesExec2->departments()->sync([$departments['sales'] => ['is_primary' => true]]);

        // 5. Project Managers
        $pm1 = User::create([
            'name' => 'Amit Verma',
            'email' => 'pm1@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543215',
        ]);
        $pm1->assignRole('project_manager');
        $pm1->departments()->sync([$departments['tech'] => ['is_primary' => true]]);

        $pm2 = User::create([
            'name' => 'Neha Gupta',
            'email' => 'pm2@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543216',
        ]);
        $pm2->assignRole('project_manager');
        $pm2->departments()->sync([$departments['design'] => ['is_primary' => true]]);

        // 6. Finance Manager
        $finance = User::create([
            'name' => 'Rohan Shah',
            'email' => 'finance@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543217',
        ]);
        $finance->assignRole('finance');

        // 7. HR Manager
        $hr = User::create([
            'name' => 'Kiran Joshi',
            'email' => 'hr@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'phone' => '+919876543218',
        ]);
        $hr->assignRole('hr');

        // 8. 5 Employees
        $employees = [];
        $employeeData = [
            ['name' => 'Ananya Rao', 'email' => 'emp1@creativals.com', 'dept' => 'design'],
            ['name' => 'Vijay Kumar', 'email' => 'emp2@creativals.com', 'dept' => 'tech'],
            ['name' => 'Rohan Das', 'email' => 'emp3@creativals.com', 'dept' => 'tech'],
            ['name' => 'Deepa Roy', 'email' => 'emp4@creativals.com', 'dept' => 'tech'],
            ['name' => 'Karan Malhotra', 'email' => 'emp5@creativals.com', 'dept' => 'marketing'],
        ];

        foreach ($employeeData as $idx => $emp) {
            $user = User::create([
                'name' => $emp['name'],
                'email' => $emp['email'],
                'password' => Hash::make('password'),
                'status' => 'active',
                'phone' => '+91987654322' . $idx,
            ]);
            $user->assignRole('employee');
            $user->departments()->sync([$departments[$emp['dept']] => ['is_primary' => true]]);
            $employees[] = $user;
        }

        // 9. 5 Clients
        $clients = [];
        $clientCompanies = [
            'Acme Corporation',
            'Globex Corporation',
            'Initech Systems',
            'Hooli Inc',
            'Umbrella Corporation'
        ];
        foreach ($clientCompanies as $idx => $companyName) {
            $slug = Str::slug($companyName);
            $clientUser = User::create([
                'name' => $companyName . ' Billing',
                'email' => 'client' . ($idx + 1) . '@creativals.com',
                'password' => Hash::make('password'),
                'status' => 'active',
                'phone' => '+1555000' . ($idx + 1),
                'is_client_portal_user' => true,
            ]);
            $clientUser->assignRole('client');
            $clients[] = $clientUser;
        }

        $this->command->info('💼 Creating employee compensations...');
        $fixedCompType = CompensationType::firstOrCreate(
            ['type' => 'fixed'],
            ['name' => 'Fixed Salary', 'description' => 'Standard fixed monthly payout']
        );
        $hourlyCompType = CompensationType::firstOrCreate(
            ['type' => 'hourly'],
            ['name' => 'Hourly Wages', 'description' => 'Payout based strictly on logged timesheet hours']
        );
        $hybridCompType = CompensationType::firstOrCreate(
            ['type' => 'hybrid'],
            ['name' => 'Hybrid (Fixed + Hourly)', 'description' => 'Fixed base salary plus hourly payment for logged hours']
        );

        $staffCompensations = [
            $founder->id => ['type' => $fixedCompType, 'base' => 150000.00, 'hours' => 160.00, 'rate' => 0.00],
            $director->id => ['type' => $fixedCompType, 'base' => 120000.00, 'hours' => 160.00, 'rate' => 0.00],
            $salesHead->id => ['type' => $hybridCompType, 'base' => 50000.00, 'hours' => 160.00, 'rate' => 300.00],
            $salesExec1->id => ['type' => $hybridCompType, 'base' => 35000.00, 'hours' => 160.00, 'rate' => 200.00],
            $salesExec2->id => ['type' => $hybridCompType, 'base' => 35000.00, 'hours' => 160.00, 'rate' => 200.00],
            $pm1->id => ['type' => $fixedCompType, 'base' => 90000.00, 'hours' => 160.00, 'rate' => 0.00],
            $pm2->id => ['type' => $fixedCompType, 'base' => 90000.00, 'hours' => 160.00, 'rate' => 0.00],
            $finance->id => ['type' => $fixedCompType, 'base' => 70000.00, 'hours' => 160.00, 'rate' => 0.00],
            $hr->id => ['type' => $fixedCompType, 'base' => 60000.00, 'hours' => 160.00, 'rate' => 0.00],
        ];

        // Seed employee compensations
        foreach ($staffCompensations as $uId => $cData) {
            EmployeeCompensation::create([
                'user_id' => $uId,
                'compensation_type_id' => $cData['type']->id,
                'base_amount' => $cData['base'],
                'currency_id' => $inr->id,
                'expected_monthly_hours' => $cData['hours'],
                'hourly_rate' => $cData['rate'],
                'effective_from' => now()->subMonths(6)->toDateString(),
                'is_current' => true,
                'notes' => 'Demo system setup',
            ]);
        }

        // Add compensation for the 5 employees (some hourly, some fixed)
        foreach ($employees as $idx => $emp) {
            $isHourly = ($idx % 2 === 0);
            EmployeeCompensation::create([
                'user_id' => $emp->id,
                'compensation_type_id' => $isHourly ? $hourlyCompType->id : $fixedCompType->id,
                'base_amount' => $isHourly ? 0.00 : 50000.00,
                'currency_id' => $inr->id,
                'expected_monthly_hours' => 160.00,
                'hourly_rate' => $isHourly ? 400.00 : 0.00,
                'effective_from' => now()->subMonths(6)->toDateString(),
                'is_current' => true,
                'notes' => 'Demo system setup',
            ]);
        }

        $this->command->info('🛠️ Seeding Services, Packages and Coupons...');

        // Service Categories
        $catDevId = ServiceCategory::where('slug', 'development')->first()?->id ?? ServiceCategory::create(['name' => 'Development', 'slug' => 'development', 'color' => '#10B981', 'is_active' => true])->id;
        $catMktId = ServiceCategory::where('slug', 'digital-marketing')->first()?->id ?? ServiceCategory::create(['name' => 'Digital Marketing', 'slug' => 'digital-marketing', 'color' => '#3B82F6', 'is_active' => true])->id;
        $catBrandId = ServiceCategory::where('slug', 'branding')->first()?->id ?? ServiceCategory::create(['name' => 'Branding', 'slug' => 'branding', 'color' => '#F59E0B', 'is_active' => true])->id;
        $catDesignId = ServiceCategory::where('slug', 'ui-ux-design')->first()?->id ?? ServiceCategory::create(['name' => 'UI/UX Design', 'slug' => 'ui-ux-design', 'color' => '#EC4899', 'is_active' => true])->id;

        $servicesList = [
            ['name' => 'Website Development', 'cat' => $catDevId, 'price' => 75000.00, 'type' => 'fixed', 'unit' => 'project'],
            ['name' => 'Ecommerce Development', 'cat' => $catDevId, 'price' => 120000.00, 'type' => 'fixed', 'unit' => 'project'],
            ['name' => 'SEO', 'cat' => $catMktId, 'price' => 25000.00, 'type' => 'monthly', 'unit' => 'month'],
            ['name' => 'Social Media Marketing', 'cat' => $catMktId, 'price' => 30000.00, 'type' => 'monthly', 'unit' => 'month'],
            ['name' => 'Branding', 'cat' => $catBrandId, 'price' => 40000.00, 'type' => 'fixed', 'unit' => 'logo_pack'],
            ['name' => 'UI/UX Design', 'cat' => $catDesignId, 'price' => 35000.00, 'type' => 'fixed', 'unit' => 'project'],
            ['name' => 'Maintenance Plans', 'cat' => $catDevId, 'price' => 10000.00, 'type' => 'monthly', 'unit' => 'month'],
        ];

        $services = [];
        foreach ($servicesList as $srv) {
            $services[] = Service::create([
                'category_id' => $srv['cat'],
                'name' => $srv['name'],
                'slug' => Str::slug($srv['name']),
                'description' => 'Professional ' . $srv['name'] . ' services tailored for growth.',
                'default_price' => $srv['price'],
                'currency_id' => $inr->id,
                'billing_type' => $srv['type'],
                'unit' => $srv['unit'],
                'is_active' => true,
                'is_taxable' => true,
                'tax_rate' => 18.00,
            ]);
        }

        // Packages
        $startupPack = Package::create([
            'name' => 'Startup Package',
            'slug' => 'startup-package',
            'description' => 'Basic bundle to get your business online.',
            'price' => 85000.00,
            'currency_id' => $inr->id,
            'billing_cycle' => 'one_time',
            'is_active' => true,
            'is_featured' => true,
        ]);
        $startupPack->services()->sync([
            $services[0]->id => ['custom_price' => 60000.00, 'quantity' => 1, 'description' => 'Standard website build'],
            $services[4]->id => ['custom_price' => 25000.00, 'quantity' => 1, 'description' => 'Startup branding pack'],
        ]);

        $growthPack = Package::create([
            'name' => 'Growth Package',
            'slug' => 'growth-package',
            'description' => 'Complete digital setup with design and marketing.',
            'price' => 130000.00,
            'currency_id' => $inr->id,
            'billing_cycle' => 'one_time',
            'is_active' => true,
            'is_featured' => false,
        ]);
        $growthPack->services()->sync([
            $services[1]->id => ['custom_price' => 100000.00, 'quantity' => 1, 'description' => 'Standard online shop'],
            $services[5]->id => ['custom_price' => 30000.00, 'quantity' => 1, 'description' => 'UI/UX mockups'],
        ]);

        $enterprisePack = Package::create([
            'name' => 'Enterprise Package',
            'slug' => 'enterprise-package',
            'description' => 'Bespoke custom systems for major corporate projects.',
            'price' => 300000.00,
            'currency_id' => $inr->id,
            'billing_cycle' => 'one_time',
            'is_active' => true,
            'is_featured' => false,
        ]);
        $enterprisePack->services()->sync([
            $services[1]->id => ['custom_price' => 200000.00, 'quantity' => 1, 'description' => 'Enterprise ecommerce engine'],
            $services[5]->id => ['custom_price' => 100000.00, 'quantity' => 1, 'description' => 'Complete software design specs'],
        ]);

        // Coupons
        $coupon1 = DiscountCoupon::create([
            'code' => 'WELCOME10',
            'description' => '10% discount on first invoice',
            'type' => 'percentage',
            'value' => 10.00,
            'minimum_amount' => 1000.00,
            'maximum_discount' => 15000.00,
            'usage_limit' => 200,
            'valid_from' => now()->startOfDay(),
            'valid_until' => now()->addYear(),
            'is_active' => true,
        ]);

        $coupon2 = DiscountCoupon::create([
            'code' => 'GROWTH20',
            'description' => '20% discount on growth plans',
            'type' => 'percentage',
            'value' => 20.00,
            'minimum_amount' => 50000.00,
            'maximum_discount' => 50000.00,
            'usage_limit' => 100,
            'valid_from' => now()->startOfDay(),
            'valid_until' => now()->addYear(),
            'is_active' => true,
        ]);

        $coupon3 = DiscountCoupon::create([
            'code' => 'FLAT500',
            'description' => 'Flat ₹500 off on any service order',
            'type' => 'fixed',
            'value' => 500.00,
            'minimum_amount' => 2000.00,
            'maximum_discount' => 500.00,
            'usage_limit' => 500,
            'valid_from' => now()->startOfDay(),
            'valid_until' => now()->addYear(),
            'is_active' => true,
        ]);

        $this->command->info('📈 Seeding 50 Leads...');

        $leadStages = LeadStage::orderBy('sort_order')->get();
        if ($leadStages->isEmpty()) {
            $this->call(LeadStageSeeder::class);
            $leadStages = LeadStage::orderBy('sort_order')->get();
        }

        $leadSources = LeadSource::all();
        if ($leadSources->isEmpty()) {
            $this->call(LeadSourceSeeder::class);
            $leadSources = LeadSource::all();
        }

        $countries = ['India', 'USA', 'UK', 'Canada', 'Australia', 'Germany', 'UAE', 'Singapore', 'South Africa', 'New Zealand'];
        $cities = ['Mumbai', 'San Jose', 'London', 'Toronto', 'Sydney', 'Berlin', 'Dubai', 'Singapore', 'Cape Town', 'Auckland'];

        $companyBases = [
            'Global Tech', 'Apex Web', 'Skyline Agency', 'Nexus Ventures', 'Peak Solutions', 'Alpha Digital', 
            'Omega Studio', 'Veridian Corp', 'Ember Media', 'Prism Systems', 'Innova Partners', 'Nova Lab', 
            'Matrix Tech', 'Quantum Ventures', 'Vanguard Legal', 'Helix Med', 'Zenith Foods', 'Vortex Commerce', 
            'Sync Software', 'Echo Design', 'Pinnacle Brands', 'Sovereign Corp', 'Crestwood Group', 'Aero Space',
            'Radiant Logistics', 'Beacon Capital', 'Pioneer Retail', 'Horizon Media', 'Blue Water', 'Starlight Tech',
            'Stellar Systems', 'Ironwood', 'Cascade Consulting', 'Dynamic Ads', 'Spark Logistics', 'Core Services',
            'Optima Finance', 'Titan Gym', 'Atlas Travel', 'Infinity Cloud', 'Enigma Cyber', 'Solar Energy',
            'True North', 'Red Wood', 'Black Diamond', 'Silver Line', 'Golden Gate', 'Emerald City', 'Copper Mine', 'Stone Arch'
        ];

        $salesStaff = [$salesExec1, $salesExec2];

        $leadsCreated = [];

        for ($i = 0; $i < 50; $i++) {
            $companyName = $companyBases[$i];
            $country = $countries[$i % count($countries)];
            $city = $cities[$i % count($cities)];
            $source = $leadSources->random();
            
            // Distribute stages logically
            if ($i < 10) {
                $stage = $leadStages->where('slug', 'fresh-lead')->first();
            } elseif ($i < 18) {
                $stage = $leadStages->where('slug', 'warm-lead')->first();
            } elseif ($i < 25) {
                $stage = $leadStages->where('slug', 'hot-lead')->first();
            } elseif ($i < 35) {
                $stage = $leadStages->where('slug', 'quote-sent')->first();
            } elseif ($i < 40) {
                $stage = $leadStages->where('slug', 'invoice-sent')->first();
            } elseif ($i < 47) {
                $stage = $leadStages->where('slug', 'won')->first();
            } else {
                $stage = $leadStages->where('slug', 'lost')->first();
            }

            $stage = $stage ?? $leadStages->random();
            $assignedExec = $salesStaff[$i % count($salesStaff)];
            
            $lead = Lead::create([
                'company_name' => $companyName,
                'website_url' => 'https://' . Str::slug($companyName) . '.com',
                'whatsapp_number' => '+91990011' . sprintf('%04d', $i),
                'city' => $city,
                'country' => $country,
                'timezone' => 'Asia/Kolkata',
                'lead_source_id' => $source->id,
                'stage_id' => $stage->id,
                'sales_exec_id' => $assignedExec->id,
                'sales_head_id' => $salesHead->id,
                'created_by' => $founder->id,
                'priority' => ['low', 'medium', 'high', 'urgent'][$i % 4],
                'temperature' => ['cold', 'warm', 'hot'][$i % 3],
                'estimated_monthly_budget' => rand(1500, 25000) * 10.00,
                'expected_start_date' => now()->addDays(rand(5, 60)),
                'notes' => 'System generated lead #' . ($i + 1) . ' for ' . $companyName . '.',
                'is_converted' => ($stage->slug === 'won'),
                'converted_client_id' => ($stage->slug === 'won') ? $clients[$i % count($clients)]->id : null,
                'converted_at' => ($stage->slug === 'won') ? now()->subDays(rand(1, 10)) : null,
            ]);

            // Add Contact
            $lead->contacts()->create([
                'name' => 'Decision Maker ' . ($i + 1),
                'designation' => ['CEO', 'Director', 'Marketing Manager', 'CTO', 'VP Sales'][$i % 5],
                'email' => 'contact' . ($i + 1) . '@' . Str::slug($companyName) . '.com',
                'phone' => '+91990022' . sprintf('%04d', $i),
                'whatsapp' => '+91990022' . sprintf('%04d', $i),
                'is_primary' => true,
                'notes' => 'Primary point of contact.',
            ]);

            // Interested Services
            $lead->services()->attach($services[$i % count($services)]->id);
            if ($i % 3 === 0) {
                $lead->services()->attach($services[($i + 1) % count($services)]->id);
            }

            // Timeline logs
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $assignedExec->id,
                'type' => 'system_event',
                'description' => 'Lead created in the system and assigned to ' . $assignedExec->name,
                'occurred_at' => now()->subDays(rand(10, 30)),
            ]);

            if ($i % 2 === 0) {
                LeadActivity::create([
                    'lead_id' => $lead->id,
                    'user_id' => $assignedExec->id,
                    'type' => 'phone_call',
                    'description' => 'Initial inquiry call logged. Client showed warm interest.',
                    'occurred_at' => now()->subDays(rand(5, 9)),
                ]);
            }

            // Schedule follow-ups
            LeadFollowup::create([
                'lead_id' => $lead->id,
                'assigned_to' => $assignedExec->id,
                'created_by' => $assignedExec->id,
                'description' => 'Regular touchpoint follow-up.',
                'type' => 'call',
                'scheduled_at' => now()->addDays(rand(1, 5)),
                'is_completed' => ($i % 2 === 0),
            ]);

            $leadsCreated[] = $lead;
        }

        $this->command->info('📝 Seeding Quotes & Approvals (Converting 20 leads)...');

        $quotes = [];
        for ($q = 0; $q < 20; $q++) {
            $lead = $leadsCreated[$q];
            
            // Set status distributions: 3 draft, 3 pending_approval, 4 rejected, 10 approved
            if ($q < 3) {
                $status = 'draft';
            } elseif ($q < 6) {
                $status = 'pending_approval';
            } elseif ($q < 10) {
                $status = 'rejected';
            } else {
                $status = 'approved';
            }

            $coupon = null;
            if ($q % 4 === 1) {
                $coupon = $coupon1;
            } elseif ($q % 4 === 2) {
                $coupon = $coupon2;
            } elseif ($q % 4 === 3) {
                $coupon = $coupon3;
            }

            $srv1 = $services[$q % count($services)];
            $srv2 = $services[($q + 2) % count($services)];

            $subtotal = $srv1->default_price + $srv2->default_price;
            $couponDiscount = 0.00;
            if ($coupon) {
                if ($coupon->type === 'percentage') {
                    $couponDiscount = $subtotal * ($coupon->value / 100);
                } else {
                    $couponDiscount = $coupon->value;
                }
            }

            $discountAmount = $couponDiscount;
            $taxable = $subtotal - $discountAmount;
            $taxAmount = $taxable * 0.18; // 18% GST
            $totalAmount = $taxable + $taxAmount;

            $quote = Quote::create([
                'lead_id' => $lead->id,
                'client_id' => $clients[$q % count($clients)]->id,
                'created_by' => $founder->id,
                'title' => $lead->company_name . ' - Solution Scope Proposal',
                'description' => 'Comprehensive design and implementation proposal.',
                'currency_id' => $inr->id,
                'exchange_rate' => 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $coupon ? $coupon->id : null,
                'coupon_discount' => $couponDiscount,
                'status' => $status,
                'valid_until' => now()->addDays(30),
                'terms_conditions' => '1. Standard 50% upfront billing.\n2. Timeline extends post scope freezes.',
                'internal_notes' => 'Calculated with coupon: ' . ($coupon ? $coupon->code : 'None'),
            ]);

            // Add Quote Items
            $quote->items()->create([
                'description' => $srv1->name,
                'quantity' => 1,
                'unit' => $srv1->unit,
                'unit_price' => $srv1->default_price,
                'discount_percent' => 0.00,
                'discount_amount' => 0.00,
                'tax_rate' => 18.00,
                'tax_amount' => $srv1->default_price * 0.18,
                'total_amount' => $srv1->default_price * 1.18,
                'sort_order' => 1,
            ]);

            $quote->items()->create([
                'description' => $srv2->name,
                'quantity' => 1,
                'unit' => $srv2->unit,
                'unit_price' => $srv2->default_price,
                'discount_percent' => 0.00,
                'discount_amount' => 0.00,
                'tax_rate' => 18.00,
                'tax_amount' => $srv2->default_price * 0.18,
                'total_amount' => $srv2->default_price * 1.18,
                'sort_order' => 2,
            ]);

            // Create Quote Approvals Audit Trail
            if ($status !== 'draft') {
                QuoteApproval::create([
                    'quote_id' => $quote->id,
                    'requested_by' => $lead->salesExec->id,
                    'approver_id' => $salesHead->id,
                    'step_number' => 1,
                    'status' => ($status === 'pending_approval') ? 'pending' : $status,
                    'comments' => ($status === 'rejected') ? 'Price needs restructuring. Re-assess rates.' : 'Looks excellent. Standard approval.',
                    'actioned_at' => ($status === 'pending_approval') ? null : now()->subHours(12),
                ]);
            }

            $quotes[] = $quote;
        }

        $this->command->info('🧾 Seeding Invoices & Payments...');

        $approvedQuotes = array_slice(array_filter($quotes, function($q) { return $q->status === 'approved'; }), 0, 10);
        $invoices = [];

        foreach ($approvedQuotes as $idx => $quote) {
            // Set status categories: 3 Paid, 3 Partially Paid, 2 Overdue, 2 Draft
            if ($idx < 3) {
                $status = 'sent'; // will become paid after payment
            } elseif ($idx < 6) {
                $status = 'sent'; // will become partially paid after partial payment
            } elseif ($idx < 8) {
                $status = 'sent'; // overdue setting
            } else {
                $status = 'draft';
            }

            $issueDate = ($idx >= 6 && $idx < 8) ? now()->subDays(35) : now()->subDays(5);
            $dueDate = ($idx >= 6 && $idx < 8) ? now()->subDays(15) : now()->addDays(15);

            $invoice = Invoice::create([
                'quote_id' => $quote->id,
                'client_id' => $quote->client_id,
                'created_by' => $founder->id,
                'title' => 'Invoice for ' . $quote->title,
                'description' => 'Billing statement for services rendered.',
                'currency_id' => $quote->currency_id,
                'exchange_rate' => 1.0000,
                'subtotal' => $quote->subtotal,
                'discount_amount' => $quote->discount_amount,
                'tax_amount' => $quote->tax_amount,
                'total_amount' => $quote->total_amount,
                'coupon_id' => $quote->coupon_id,
                'coupon_discount' => $quote->coupon_discount,
                'status' => $status,
                'issue_date' => $issueDate->toDateString(),
                'due_date' => $dueDate->toDateString(),
                'terms_conditions' => $quote->terms_conditions,
                'client_notes' => 'Thank you for your business.',
                'internal_notes' => 'Invoice linked to quote ' . $quote->quote_number,
            ]);

            // Add Invoice Items matching quote items
            foreach ($quote->items as $qItem) {
                $invoice->items()->create([
                    'description' => $qItem->description,
                    'quantity' => $qItem->quantity,
                    'unit' => $qItem->unit,
                    'unit_price' => $qItem->unit_price,
                    'tax_type' => $qItem->tax_rate > 0 ? 'custom' : 'none',
                    'discount_percent' => $qItem->discount_percent,
                    'discount_amount' => $qItem->discount_amount,
                    'tax_rate' => $qItem->tax_rate,
                    'tax_amount' => $qItem->tax_amount,
                    'total_amount' => $qItem->total_amount,
                ]);
            }

            // Record Payments
            if ($idx < 3) {
                // Fully Paid
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'amount' => $invoice->total_amount,
                    'payment_date' => now()->subDays(2)->toDateString(),
                    'payment_method' => 'bank_transfer',
                    'transaction_reference' => 'TXN-FULL-' . sprintf('%04d', $idx),
                    'notes' => 'Received via bank wire.',
                    'recorded_by' => $finance->id,
                ]);
            } elseif ($idx < 6) {
                // Partially Paid
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'amount' => $invoice->total_amount / 2,
                    'payment_date' => now()->subDays(1)->toDateString(),
                    'payment_method' => 'upi',
                    'transaction_reference' => 'TXN-PART-' . sprintf('%04d', $idx),
                    'notes' => 'Advance token payment received.',
                    'recorded_by' => $finance->id,
                ]);
            }

            $invoice->recalculateTotals();
            $invoices[] = $invoice;
        }

        $this->command->info('🚀 Seeding Projects, Milestones, and Members...');

        // Convert the 10 invoices into projects
        // We need: 10 active, 3 completed, 2 delayed (total 15 projects)
        // Since we only have 10 invoices, we can create the remaining 5 projects directly or link them to existing ones.
        $projects = [];

        for ($p = 0; $p < 15; $p++) {
            $invoice = $invoices[$p % count($invoices)];
            $client = $invoice->client;
            $pm = ($p % 2 === 0) ? $pm1 : $pm2;

            if ($p < 10) {
                $status = ($p % 3 === 0) ? 'planning' : 'in_progress';
                $startDate = now()->subDays(rand(5, 30));
                $endDate = now()->addDays(rand(30, 90));
                $compPercentage = rand(10, 80);
            } elseif ($p < 13) {
                $status = 'completed';
                $startDate = now()->subDays(60);
                $endDate = now()->subDays(15);
                $compPercentage = 100;
            } else {
                $status = 'in_progress'; // will mark as delayed by setting endDate in the past
                $startDate = now()->subDays(45);
                $endDate = now()->subDays(5);
                $compPercentage = rand(40, 75);
            }

            $project = Project::create([
                'name' => $client->name . ' - Product Run #' . ($p + 1),
                'description' => 'Professional scope delivery for project development and analytics.',
                'client_id' => $client->id,
                'invoice_id' => $invoice->id,
                'manager_id' => $pm->id,
                'status' => $status,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'budget_hours' => 300.00,
                'budget_amount' => $invoice->total_amount,
                'completion_percentage' => $compPercentage,
                'is_recurring' => false,
            ]);

            // Link Departments
            $project->departments()->sync([
                $departments['tech'] => ['lead_user_id' => $pm1->id],
                $departments['design'] => ['lead_user_id' => $pm2->id],
            ]);

            // Add Members
            ProjectMember::create([
                'project_id' => $project->id,
                'user_id' => $pm->id,
                'role' => 'manager',
                'joined_at' => now(),
            ]);

            // Assign 3 employees as project members
            $emp1 = $employees[$p % count($employees)];
            $emp2 = $employees[($p + 1) % count($employees)];
            $emp3 = $employees[($p + 2) % count($employees)];

            ProjectMember::create(['project_id' => $project->id, 'user_id' => $emp1->id, 'role' => 'lead', 'joined_at' => now()]);
            ProjectMember::create(['project_id' => $project->id, 'user_id' => $emp2->id, 'role' => 'member', 'joined_at' => now()]);
            ProjectMember::create(['project_id' => $project->id, 'user_id' => $emp3->id, 'role' => 'member', 'joined_at' => now()]);

            // Add Milestones
            $m1 = Milestone::create([
                'project_id' => $project->id,
                'name' => 'Discovery & Wireframes',
                'description' => 'Initial scope alignment.',
                'due_date' => $startDate->addDays(10)->toDateString(),
                'status' => ($status === 'completed') ? 'completed' : 'completed',
                'completion_percentage' => 100,
                'sort_order' => 1,
            ]);

            $m2 = Milestone::create([
                'project_id' => $project->id,
                'name' => 'Core Development Build',
                'description' => 'Main engineering module implementation.',
                'due_date' => $startDate->addDays(30)->toDateString(),
                'status' => ($status === 'completed') ? 'completed' : (($status === 'planning') ? 'pending' : 'in_progress'),
                'completion_percentage' => ($status === 'completed') ? 100 : (($status === 'planning') ? 0 : 50),
                'sort_order' => 2,
            ]);

            $m3 = Milestone::create([
                'project_id' => $project->id,
                'name' => 'QA Testing & Deploy',
                'description' => 'Pre-release checks and client signoff.',
                'due_date' => $endDate->toDateString(),
                'status' => ($status === 'completed') ? 'completed' : 'pending',
                'completion_percentage' => ($status === 'completed') ? 100 : 0,
                'sort_order' => 3,
            ]);

            $project->m1_id = $m1->id;
            $project->m2_id = $m2->id;
            $project->m3_id = $m3->id;

            $projects[] = $project;
        }

        $this->command->info('📋 Seeding 100+ Tasks & Dependencies...');

        $taskCount = 0;
        $allCreatedTasks = [];

        foreach ($projects as $projIdx => $project) {
            $mIds = [$project->m1_id, $project->m2_id, $project->m3_id];
            
            // Generate 8 tasks per project to reach 120 tasks (exceeding 100+ task requirement)
            $projTasks = [];
            for ($t = 0; $t < 8; $t++) {
                $taskCount++;
                $milestoneId = $mIds[$t % count($mIds)];
                $assignee = $project->members->where('role', '!=', 'manager')->random()->user;

                $tStatus = 'todo';
                $tPercent = 0;
                if ($project->status === 'completed') {
                    $tStatus = 'done';
                    $tPercent = 100;
                } else {
                    if ($t % 3 === 0) {
                        $tStatus = 'in_progress';
                        $tPercent = rand(20, 80);
                    } elseif ($t % 3 === 1) {
                        $tStatus = 'review';
                        $tPercent = 90;
                    } elseif ($t % 3 === 2 && $t > 4) {
                        $tStatus = 'blocked';
                        $tPercent = 30;
                    }
                }

                $task = Task::create([
                    'project_id' => $project->id,
                    'milestone_id' => $milestoneId,
                    'parent_task_id' => ($t === 3 || $t === 4) ? $projTasks[0]->id : null, // Create subtasks
                    'title' => 'Deliverable Module ' . $taskCount . ' - ' . ['Setup', 'Design UI', 'Write API', 'Write Tests', 'Audit Layout', 'Optimize Database', 'Configure DNS', 'Verify SSL'][$t % 8],
                    'description' => 'Detailed engineering checklist description for task ' . $taskCount,
                    'assigned_to' => $assignee->id,
                    'created_by' => $project->manager_id,
                    'status' => $tStatus,
                    'priority' => ['low', 'medium', 'high', 'urgent'][$t % 4],
                    'due_date' => $project->end_date ? $project->end_date->subDays(rand(1, 10))->toDateString() : now()->addDays(5)->toDateString(),
                    'estimated_hours' => rand(5, 40) * 1.00,
                    'actual_hours' => ($tStatus === 'done') ? rand(5, 40) * 1.00 : 0.00,
                    'completion_percentage' => $tPercent,
                    'sort_order' => $t + 1,
                ]);

                $projTasks[] = $task;
                $allCreatedTasks[] = $task;

                // Add task comment
                if ($t % 3 === 0) {
                    $task->comments()->create([
                        'user_id' => $project->manager_id,
                        'comment' => 'Please coordinate with the design team before beginning this layout.',
                        'is_internal' => false,
                    ]);
                }
            }

            // Create Task Dependencies (finish_to_start)
            if (count($projTasks) >= 3) {
                $projTasks[1]->dependencies()->attach($projTasks[0]->id, ['type' => 'finish_to_start']);
                $projTasks[2]->dependencies()->attach($projTasks[1]->id, ['type' => 'finish_to_start']);
            }
        }

        $this->command->info("✅ Successfully created {$taskCount} tasks!");

        $this->command->info('📅 Seeding 60 Days of Timesheet Entries...');

        // Generate timesheet entries for the last 60 days
        $startDate = now()->subDays(60);
        $timesheetsToCreate = [];

        // We will loop through each weekday in the last 60 days
        // and create logged hours for our 5 employees across active projects/tasks
        for ($day = 0; $day < 60; $day++) {
            $currentDate = $startDate->copy()->addDays($day);
            if ($currentDate->isWeekend()) {
                continue;
            }

            foreach ($employees as $empIdx => $employee) {
                // Find projects this employee is a member of
                $employeeProjects = Project::whereHas('members', function($q) use ($employee) {
                    $q->where('user_id', $employee->id);
                })->get();

                if ($employeeProjects->isEmpty()) {
                    continue;
                }

                $project = $employeeProjects->random();
                // Find a task in this project assigned to this user
                $task = Task::where('project_id', $project->id)->where('assigned_to', $employee->id)->first();
                if (!$task) {
                    $task = Task::where('project_id', $project->id)->first();
                }

                if (!$task) {
                    continue;
                }

                $loggedHours = rand(4, 8) * 1.00;
                $status = 'approved';
                if ($day > 55) {
                    $status = ($day % 2 === 0) ? 'submitted' : 'draft';
                }

                $timesheet = Timesheet::create([
                    'user_id' => $employee->id,
                    'project_id' => $project->id,
                    'task_id' => $task->id,
                    'date' => $currentDate->toDateString(),
                    'hours_logged' => $loggedHours,
                    'description' => 'Worked on feature engineering ' . $task->title,
                    'is_billable' => ($empIdx % 4 !== 3),
                    'status' => $status,
                ]);

                // Create Timesheet Approvals for submitted/approved timesheets
                if ($status !== 'draft') {
                    TimesheetApproval::create([
                        'timesheet_id' => $timesheet->id,
                        'approver_id' => $project->manager_id,
                        'action' => $status,
                        'notes' => ($status === 'approved') ? 'Hours matched deliverables.' : null,
                    ]);
                }
            }
        }

        // Recompute Task actual_hours based on timesheets
        foreach ($allCreatedTasks as $task) {
            $taskHoursSum = Timesheet::where('task_id', $task->id)
                ->where('status', 'approved')
                ->sum('hours_logged');
            $task->update(['actual_hours' => $taskHoursSum]);
        }

        $this->command->info('💰 Seeding Expenses & Vendors...');

        // Expense Categories
        $expCatOffice = ExpenseCategory::where('slug', 'office-supplies')->first() ?? ExpenseCategory::create(['name' => 'Office Supplies', 'slug' => 'office-supplies', 'icon' => 'paperclip', 'color' => '#F59E0B']);
        $expCatSaaS = ExpenseCategory::where('slug', 'software-saas')->first() ?? ExpenseCategory::create(['name' => 'Software & SaaS', 'slug' => 'software-saas', 'icon' => 'laptop', 'color' => '#3B82F6']);
        $expCatTravel = ExpenseCategory::where('slug', 'travel-lodging')->first() ?? ExpenseCategory::create(['name' => 'Travel & Lodging', 'slug' => 'travel-lodging', 'icon' => 'plane', 'color' => '#10B981']);

        // Vendors
        $v1 = Vendor::create(['name' => 'Amazon Web Services', 'contact_name' => 'Billing Team', 'email' => 'billing@aws.com', 'website' => 'https://aws.com', 'currency_id' => $usd->id, 'notes' => 'Cloud servers']);
        $v2 = Vendor::create(['name' => 'GitHub Inc', 'contact_name' => 'GitHub Ops', 'email' => 'billing@github.com', 'website' => 'https://github.com', 'currency_id' => $usd->id, 'notes' => 'Code versioning']);
        $v3 = Vendor::create(['name' => 'Local Hardware Store', 'contact_name' => 'Inventory Desk', 'email' => 'store@local.com', 'website' => 'https://localstore.com', 'currency_id' => $inr->id, 'notes' => 'Cables and adapters']);

        // 1. Project Expenses (Billable)
        for ($e = 0; $e < 15; $e++) {
            $project = $projects[$e % count($projects)];
            $vendor = ($e % 2 === 0) ? $v1 : $v2;
            
            Expense::create([
                'project_id' => $project->id,
                'category_id' => $expCatSaaS->id,
                'vendor_id' => $vendor->id,
                'submitted_by' => $project->manager_id,
                'title' => 'Project Cloud Host Retainer #' . ($e + 1),
                'description' => 'Hosting server billing for staging and production testing.',
                'amount' => rand(500, 3000) * 1.00,
                'currency_id' => $usd->id,
                'status' => 'approved',
                'is_billable' => true,
                'expense_date' => now()->subDays(rand(5, 40))->toDateString(),
                'approved_by' => $finance->id,
            ]);
        }

        // 2. Overhead/Office Expenses
        Expense::create([
            'category_id' => $expCatOffice->id,
            'vendor_id' => $v3->id,
            'submitted_by' => $founder->id,
            'title' => 'Office Networking Switches',
            'description' => 'Local hardware accessories upgrade.',
            'amount' => 12500.00,
            'currency_id' => $inr->id,
            'status' => 'approved',
            'is_billable' => false,
            'expense_date' => now()->subDays(12)->toDateString(),
            'approved_by' => $finance->id,
        ]);

        Expense::create([
            'category_id' => $expCatTravel->id,
            'submitted_by' => $salesHead->id,
            'title' => 'Client Meet Travel Reimbursement',
            'description' => 'Flight and cab expenses for sales closure meeting.',
            'amount' => 18000.00,
            'currency_id' => $inr->id,
            'status' => 'approved',
            'is_billable' => false,
            'expense_date' => now()->subDays(20)->toDateString(),
            'approved_by' => $finance->id,
        ]);

        $this->command->info('💵 Seeding Payroll Runs (2 months)...');

        $payrollMonths = [
            ['year' => 2026, 'month' => 4],
            ['year' => 2026, 'month' => 5],
        ];

        foreach ($payrollMonths as $pMonth) {
            $run = PayrollRun::create([
                'year' => $pMonth['year'],
                'month' => $pMonth['month'],
                'status' => 'approved',
                'submitted_by' => $finance->id,
                'approved_by' => $founder->id,
                'approved_at' => now()->subDays(5),
                'currency_id' => $inr->id,
            ]);

            // Add run items for all staff users (founder, director, salesHead, pm1, pm2, finance, hr, employees)
            $payrollStaff = [
                $founder, $director, $salesHead, $salesExec1, $salesExec2, $pm1, $pm2, $finance, $hr
            ];
            $payrollStaff = array_merge($payrollStaff, $employees);

            foreach ($payrollStaff as $sUser) {
                $comp = $sUser->activeCompensation;
                if (!$comp) {
                    continue;
                }

                $baseAmount = $comp->base_amount;
                $hourlyRate = $comp->hourly_rate;

                $timesheetHours = Timesheet::where('user_id', $sUser->id)
                    ->where('status', 'approved')
                    ->whereYear('date', $pMonth['year'])
                    ->whereMonth('date', $pMonth['month'])
                    ->sum('hours_logged');

                $calculatedSalary = 0.00;
                if ($comp->compensationType->type === 'fixed') {
                    $calculatedSalary = $baseAmount;
                } elseif ($comp->compensationType->type === 'hourly') {
                    $calculatedSalary = $timesheetHours * $hourlyRate;
                } elseif ($comp->compensationType->type === 'hybrid') {
                    $calculatedSalary = $baseAmount + ($timesheetHours * $hourlyRate);
                }

                $bonusAmount = rand(0, 5) === 0 ? 5000.00 : 0.00;
                $netSalary = $calculatedSalary + $bonusAmount;

                $item = PayrollRunItem::create([
                    'payroll_run_id' => $run->id,
                    'user_id' => $sUser->id,
                    'base_amount' => $calculatedSalary,
                    'bonus_amount' => $bonusAmount,
                    'adjustment_amount' => 0.00,
                    'net_amount' => $netSalary,
                    'status' => 'paid',
                    'paid_at' => now()->toDateString(),
                ]);

                // Create adjustments or bonuses
                if ($bonusAmount > 0) {
                    Bonus::create([
                        'payroll_run_id' => $run->id,
                        'user_id' => $sUser->id,
                        'amount' => $bonusAmount,
                        'reason' => 'Performance Bonus',
                        'approved_by' => $founder->id,
                    ]);
                }
            }
        }

        $this->command->info('✅ Production Demo Seeder execution finished successfully!');
    }
}
