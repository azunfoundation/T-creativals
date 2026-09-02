<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreateProjectsBatchCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'project:create-batch-active';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Create in_progress projects for all 41 specified clients, assigning Rahil as Manager and Farhan & Faizan as Team Members';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info("=== CREATING IN_PROGRESS PROJECTS FOR 41 CLIENTS ===");

        // Fetch team members
        $rahilUser = User::where('email', 'founder@creativals.com')->first() ?? User::first();
        $farhanUser = User::where('email', 'farhan@creativals.in')->first() ?? User::where('name', 'like', '%Farhan%')->first();
        $faizanUser = User::where('email', 'faizan@creativals.in')->first() ?? User::where('name', 'like', '%Faizan%')->first();

        if (!$rahilUser) {
            $this->error("Error: Could not find Rahil Azeez (founder@creativals.com)");
            return Command::FAILURE;
        }

        $this->info("Manager: {$rahilUser->name} ({$rahilUser->email})");
        $this->info("Team Member 1: " . ($farhanUser ? "{$farhanUser->name} ({$farhanUser->email})" : 'Not Found'));
        $this->info("Team Member 2: " . ($faizanUser ? "{$faizanUser->name} ({$faizanUser->email})" : 'Not Found'));

        $projectsList = [
            ['client' => 'Beyond the Shore', 'title' => 'Beyond the Shore — Digital Marketing', 'budget' => 30000.00, 'inv_title' => 'Ongoing - Full Digital Marketing'],
            ['client' => 'House of Form', 'title' => 'House of Form — Website Development', 'budget' => 7000.00, 'inv_title' => 'Website'],
            ['client' => 'Teak Studio', 'title' => 'Teak Studio — Meta Ads Campaign', 'budget' => 3000.00, 'inv_title' => 'Meta Ads'],
            ['client' => 'Besure', 'title' => 'Besure — Outsourced Development', 'budget' => 400000.00, 'inv_title' => 'Outsourced-Work'],
            ['client' => 'Yala Reality', 'title' => 'Yala Reality — Website Development (3 Sites)', 'budget' => 60000.00, 'inv_title' => 'Websites - 3'],
            ['client' => 'Hotel Oak by Mega Group', 'title' => 'Hotel Oak — Swiggy & Zomato Delivery Setup', 'budget' => 8000.00, 'inv_title' => 'Swiggy/Zomato'],
            ['client' => 'Hotel Oak by Mega Group', 'title' => 'Hotel Oak — Social Media Marketing Retainer', 'budget' => 5000.00, 'inv_title' => 'Social Media Marketing'],
            ['client' => 'Nexhouz', 'title' => 'Nexhouz — Full Digital Marketing', 'budget' => 60000.00, 'inv_title' => 'Full Digital Marketing'],
            ['client' => 'Merch BPL Baseball', 'title' => 'Merch BPL Baseball — Website Development', 'budget' => 200000.00, 'inv_title' => 'Website'],
            ['client' => 'Embun Teratai', 'title' => 'Embun Teratai — Full Digital Marketing', 'budget' => 100000.00, 'inv_title' => 'Full Digital Marketing'],
            ['client' => 'Embun Teratai', 'title' => 'Embun Teratai — Social Media Marketing Retainer', 'budget' => 30000.00, 'inv_title' => 'Social Media Marketing'],
            ['client' => 'Elite Architecture', 'title' => 'Elite Architecture — Domain & Ops Maintenance', 'budget' => 2000.00, 'inv_title' => 'Domain renewal'],
            ['client' => 'Hydi Resort', 'title' => 'Hydi Resort — Marketing Campaign', 'budget' => 25000.00, 'inv_title' => 'Marketing'],
            ['client' => 'Spatial Alphabet', 'title' => 'Spatial Alphabet — Website Development', 'budget' => 25000.00, 'inv_title' => 'Website'],
            ['client' => 'BRIQ Pre School', 'title' => 'BRIQ Pre School — Full Digital Marketing Retainer', 'budget' => 20000.00, 'inv_title' => 'Full Digital Marketing'],
            ['client' => 'BRIQ Pre School', 'title' => 'BRIQ Pre School — Website Development', 'budget' => 10000.00, 'inv_title' => 'Website'],
            ['client' => 'Rawdah Express', 'title' => 'Rawdah Express — Umrah Website Development', 'budget' => 50000.00, 'inv_title' => 'Website'],
            ['client' => 'Bear Lake Montessori', 'title' => 'Bear Lake Montessori — Full Digital Marketing', 'budget' => 50000.00, 'inv_title' => 'Full Digital Marketing'],
            ['client' => 'Etch a Memory Shopify Site', 'title' => 'Etch a Memory — Shopify Store Enhancement', 'budget' => 30000.00, 'inv_title' => 'Website'],
            ['client' => 'Scrapwala Hyderabad', 'title' => 'Scrapwala — Meta Ads Lead Gen', 'budget' => 4000.00, 'inv_title' => 'Meta Ads'],
            ['client' => 'Brewed Roots', 'title' => 'Brewed Roots — Website Revamp', 'budget' => 10000.00, 'inv_title' => 'Website Revamp'],
            ['client' => 'Dyana Mobile Per Services', 'title' => 'Dyana Mobile — Website Revamp', 'budget' => 10000.00, 'inv_title' => 'Website Revamp'],
            ['client' => 'Ybrant Global School', 'title' => 'Ybrant Global School — Digital Marketing', 'budget' => 10000.00, 'inv_title' => 'Full Digital Marketing'],
            ['client' => 'Sistla International School', 'title' => 'Sistla International School — Digital Marketing', 'budget' => 10000.00, 'inv_title' => 'Full Digital Marketing'],
            ['client' => 'Shield Lock and Key Australia', 'title' => 'Shield Lock & Key — Website Revamp', 'budget' => 10000.00, 'inv_title' => 'Website Revamp'],
            ['client' => 'Gopuppy', 'title' => 'Gopuppy — Domain & Hosting Setup', 'budget' => 4000.00, 'inv_title' => 'Domain and Hosting'],
            ['client' => 'Gopuppy', 'title' => 'Gopuppy — Monthly SEO Retainer', 'budget' => 3000.00, 'inv_title' => 'SEO'],
            ['client' => 'invitivals', 'title' => 'Invitivals — Event Invitations Tech & Growth', 'budget' => 35000.00, 'inv_title' => null],
            ['client' => 'Crazee Marios', 'title' => 'Crazee Marios — Digital Marketing', 'budget' => 20000.00, 'inv_title' => null],
            ['client' => 'Creativals', 'title' => 'Creativals OS — Internal Operations & CRM', 'budget' => 100000.00, 'inv_title' => null],
            ['client' => 'Medi Care Pharmacy', 'title' => 'Medi Care Pharmacy — Marketing & Footfall Growth', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Desi Pakwaan', 'title' => 'Desi Pakwaan — Restaurant Marketing & Branding', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Sky Palace', 'title' => 'Sky Palace — Hospitality Marketing & Growth', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Tour Hyderabad', 'title' => 'Tour Hyderabad — Travel SEO & Digital Retainer', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'r9 Convention', 'title' => 'R9 Convention — Venue Digital Marketing', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Little Scholars High School', 'title' => 'Little Scholars High School — Digital Marketing', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Saadhya Global School', 'title' => 'Saadhya Global School — Admissions Marketing', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Aakash Institute', 'title' => 'Aakash Institute — Student Lead Gen & Ads', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Amego Classique Home Studio', 'title' => 'Amego Classique — Interior Branding & Growth', 'budget' => 15000.00, 'inv_title' => null],
            ['client' => 'Glampinn Valley', 'title' => 'Glampinn Valley — Resort Growth & Campaign', 'budget' => 50000.00, 'inv_title' => null],
            ['client' => 'Hydi Resort', 'title' => 'Hydi Resort — Full Digital Marketing Retainer', 'budget' => 25000.00, 'inv_title' => null],
        ];

        DB::beginTransaction();

        try {
            $createdCount = 0;

            foreach ($projectsList as $pData) {
                $clientSearch = $pData['client'];

                // Find client
                $clientUser = User::role('client')
                    ->where('company_name', 'like', "%{$clientSearch}%")
                    ->orWhere('name', 'like', "%{$clientSearch}%")
                    ->first();

                if (!$clientUser) {
                    // Create client on the fly if needed
                    $cleanEmail = 'client.' . Str::slug($clientSearch) . '@creativals.in';
                    $clientUser = User::create([
                        'name' => $clientSearch,
                        'company_name' => $clientSearch,
                        'email' => $cleanEmail,
                        'password' => bcrypt(Str::random(16)),
                        'status' => 'active',
                        'is_client_portal_user' => true,
                    ]);
                    $clientUser->syncRoles(['client']);
                }

                // Find linked invoice if applicable
                $linkedInvoice = null;
                if ($pData['inv_title']) {
                    $linkedInvoice = Invoice::where('client_id', $clientUser->id)
                        ->where('title', 'like', "%{$pData['inv_title']}%")
                        ->first();
                }

                $budget = $linkedInvoice ? (float) $linkedInvoice->total_amount : (float) $pData['budget'];

                // Check if identical project exists to avoid duplicate
                $project = Project::where('client_id', $clientUser->id)
                    ->where('name', $pData['title'])
                    ->first();

                if (!$project) {
                    $project = Project::create([
                        'name' => $pData['title'],
                        'description' => "Active client project for {$clientUser->name}. Managed by Rahil Azeez with Farhan & Faizan assigned.",
                        'client_id' => $clientUser->id,
                        'manager_id' => $rahilUser->id,
                        'invoice_id' => $linkedInvoice ? $linkedInvoice->id : null,
                        'status' => 'in_progress',
                        'priority' => 'high',
                        'start_date' => '2026-08-01',
                        'end_date' => null, // Ongoing retainer / project
                        'budget_hours' => 50,
                        'budget_amount' => $budget,
                        'completion_percentage' => 25,
                    ]);
                } else {
                    $project->update([
                        'manager_id' => $rahilUser->id,
                        'status' => 'in_progress',
                        'budget_amount' => $budget,
                        'invoice_id' => $linkedInvoice ? $linkedInvoice->id : $project->invoice_id,
                    ]);
                }

                // Assign members: Farhan & Faizan
                if ($farhanUser) {
                    ProjectMember::firstOrCreate(
                        ['project_id' => $project->id, 'user_id' => $farhanUser->id],
                        ['role' => 'lead', 'joined_at' => now()]
                    );
                }

                if ($faizanUser) {
                    ProjectMember::firstOrCreate(
                        ['project_id' => $project->id, 'user_id' => $faizanUser->id],
                        ['role' => 'member', 'joined_at' => now()]
                    );
                }

                $createdCount++;
                $invInfo = $linkedInvoice ? " (Linked Invoice #{$linkedInvoice->invoice_number})" : '';
                $this->info("Project #{$project->id}: {$project->name} | Client: {$clientUser->name} | Manager: Rahil | Members: Farhan, Faizan [Status: in_progress]{$invInfo}");
            }

            DB::commit();

            $this->info("✅ SUCCESS: Successfully created/updated {$createdCount} projects in IN_PROGRESS status!");
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error("FAILED: " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
            return Command::FAILURE;
        }
    }
}
