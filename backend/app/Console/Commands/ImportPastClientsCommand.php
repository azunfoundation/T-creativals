<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\ClientContact;
use App\Models\Lead;
use App\Models\LeadContact;
use App\Models\LeadSource;
use App\Models\LeadStage;
use App\Models\LeadTag;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ImportPastClientsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'crm:import-past-clients {--dry-run : Run the import without persisting to the database}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import & convert 185 historical agency clients into both Lead records and Client Users with Rahil Azeez assigned as Sales Exec & Sales Head';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $isDryRun = $this->option('dry-run');

        $this->info($isDryRun ? '=== DRY RUN MODE: No changes will be saved to DB ===' : '=== CONVERTING & IMPORTING HISTORICAL CLIENTS ===');

        // Find or fallback to Rahil Azeez user (founder@creativals.com)
        $rahilUser = User::where('email', 'founder@creativals.com')->first()
            ?? User::where('name', 'like', '%Rahil%')->first()
            ?? User::first();

        if (!$rahilUser) {
            $this->error("Error: Could not find Rahil Azeez (founder@creativals.com) user account.");
            return Command::FAILURE;
        }

        $this->info("Assigned Sales Executive & Sales Head: {$rahilUser->name} ({$rahilUser->email})");

        $stage = LeadStage::firstOrCreate(
            ['slug' => 'converted'],
            ['name' => 'Converted', 'color' => '#10B981', 'sort_order' => 10, 'is_system' => true]
        );

        $source = LeadSource::firstOrCreate(
            ['slug' => 'historical-client-onboarding'],
            ['name' => 'Historical Client Onboarding', 'icon' => 'archive', 'color' => '#6366F1', 'is_active' => true]
        );

        $clients = $this->getClientData();
        $importedCount = 0;
        $convertedCount = 0;

        DB::beginTransaction();

        try {
            foreach ($clients as $index => $clientData) {
                if (empty($clientData['company_name'])) {
                    continue;
                }

                $companyName = trim($clientData['company_name']);
                $slug = Str::slug($companyName);

                // Generate clean, unique client email for system directory
                $cleanEmail = $this->generateClientEmail($companyName, $clientData['website_url'] ?? null, $index);

                if ($isDryRun) {
                    $this->line("Would convert: [{$companyName}] -> Client User Email: {$cleanEmail}");
                    $importedCount++;
                    continue;
                }

                // 1. Create or Update Client User Account (User table with role 'client')
                $clientUser = User::where('company_name', $companyName)
                    ->orWhere('email', $cleanEmail)
                    ->first();

                if (!$clientUser) {
                    $clientUser = User::create([
                        'name' => $companyName,
                        'company_name' => $companyName,
                        'email' => $cleanEmail,
                        'password' => Hash::make(Str::random(16)),
                        'phone' => $clientData['phone'] ?? null,
                        'billing_address' => implode(', ', array_filter([$clientData['city'] ?? null, $clientData['country'] ?? 'India'])),
                        'status' => 'active',
                        'is_client_portal_user' => true,
                    ]);
                } else {
                    $clientUser->update([
                        'company_name' => $companyName,
                        'phone' => $clientData['phone'] ?? $clientUser->phone,
                        'status' => 'active',
                    ]);
                }

                $clientUser->syncRoles(['client']);

                // Create primary Client Contact if phone exists
                if (!empty($clientData['phone'])) {
                    ClientContact::updateOrCreate(
                        ['client_id' => $clientUser->id, 'phone' => $clientData['phone']],
                        [
                            'name' => $companyName . ' Representative',
                            'phone' => $clientData['phone'],
                            'is_primary' => true,
                        ]
                    );
                }

                // 2. Create or Update Lead record
                $lead = Lead::where('company_name', $companyName)->first();

                if (!$lead) {
                    $lead = Lead::create([
                        'company_name' => $companyName,
                        'website_url' => $clientData['website_url'] ?? null,
                        'whatsapp_number' => $clientData['phone'] ?? null,
                        'city' => $clientData['city'] ?? null,
                        'country' => $clientData['country'] ?? 'India',
                        'lead_source_id' => $source->id,
                        'stage_id' => $stage->id,
                        'sales_exec_id' => $rahilUser->id,
                        'sales_head_id' => $rahilUser->id,
                        'created_by' => $rahilUser->id,
                        'priority' => 'high',
                        'temperature' => 'hot',
                        'notes' => $clientData['summary'] ?? null,
                        'is_converted' => true,
                        'converted_client_id' => $clientUser->id,
                        'converted_at' => now(),
                    ]);
                } else {
                    $lead->update([
                        'sales_exec_id' => $rahilUser->id,
                        'sales_head_id' => $rahilUser->id,
                        'stage_id' => $stage->id,
                        'is_converted' => true,
                        'converted_client_id' => $clientUser->id,
                        'converted_at' => $lead->converted_at ?? now(),
                    ]);
                }

                if (!empty($clientData['phone'])) {
                    LeadContact::updateOrCreate(
                        ['lead_id' => $lead->id, 'phone' => $clientData['phone']],
                        [
                            'name' => $companyName . ' Primary Contact',
                            'phone' => $clientData['phone'],
                            'whatsapp' => $clientData['phone'],
                            'is_primary' => true,
                        ]
                    );
                }

                // Attach tags
                foreach ($clientData['services'] as $serviceName) {
                    LeadTag::firstOrCreate([
                        'lead_id' => $lead->id,
                        'tag' => $serviceName,
                    ]);
                }

                if (!empty($clientData['category'])) {
                    LeadTag::firstOrCreate([
                        'lead_id' => $lead->id,
                        'tag' => 'Category: ' . $clientData['category'],
                    ]);
                }

                $importedCount++;
                $convertedCount++;
                $this->info("Converted ({$importedCount}): {$companyName} -> Client ID #{$clientUser->id}");
            }

            if ($isDryRun) {
                DB::rollBack();
                $this->info("Dry run complete. {$importedCount} records validated.");
            } else {
                DB::commit();
                $this->info("SUCCESS: Successfully converted {$convertedCount} historical clients into official Client User accounts! All assigned to Rahil Azeez.");
            }

            return Command::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error("FAILED: Import failed due to exception: " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
            return Command::FAILURE;
        }
    }

    /**
     * Generate clean, unique client email address.
     */
    private function generateClientEmail(string $companyName, ?string $websiteUrl, int $index): string
    {
        $slug = Str::slug($companyName);

        if (!empty($websiteUrl) && str_contains($websiteUrl, '.')) {
            $host = parse_url($websiteUrl, PHP_URL_HOST) ?? $websiteUrl;
            $host = preg_replace('/^www\./', '', strtolower(trim($host)));
            if (!empty($host) && str_contains($host, '.')) {
                return 'contact@' . $host;
            }
        }

        return 'client.' . $slug . '.' . ($index + 1) . '@creativals.in';
    }

    /**
     * Get the full structured dataset of historical clients.
     *
     * @return array<int, array<string, mixed>>
     */
    private function getClientData(): array
    {
        return [
            ['company_name' => 'Keka Pre School', 'phone' => '+91 9490885858', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Early Education'],
            ['company_name' => 'House of Form', 'phone' => '+91 9963734499', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Design & Living'],
            ['company_name' => 'Rawdah Express', 'phone' => '+1 5612125941', 'summary' => 'Website development for Umrah site in USA', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Travel & Umrah'],
            ['company_name' => 'Bear Lake Montessori', 'phone' => '+1 4079211323', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Early Education'],
            ['company_name' => 'Upayaind', 'phone' => '+1 7247139241', 'summary' => 'Agency Client', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Global', 'country' => 'USA', 'category' => 'Services'],
            ['company_name' => 'Tour Hyderabad', 'phone' => '+91 9652972699', 'summary' => 'Agency Client', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Travel & Tourism'],
            ['company_name' => 'Yala Reality', 'phone' => '+1 9495221103', 'summary' => 'Agency Client', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Global', 'country' => 'USA', 'category' => 'Real Estate'],
            ['company_name' => 'Sky Palace', 'phone' => '+91 8790740851', 'summary' => 'Agency Client', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'RL Tours and Travels', 'phone' => '+91 9502912185', 'summary' => 'Made them rank as top 3 travel agency in Hyderabad', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://rltours.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Travel & Tourism'],
            ['company_name' => 'Rentop', 'phone' => '+91 8861118415', 'summary' => 'Best bike rental platform of India', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://rentop.in/', 'city' => 'Bengaluru', 'country' => 'India', 'category' => 'Mobility & SaaS'],
            ['company_name' => 'Hotel Sky Park', 'phone' => '+91 9346468248', 'summary' => 'Took their revenue from 3 lakhs to 8 lakhs per month', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://hotelskypark.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Hotel Sky International', 'phone' => '+91 7569482200', 'summary' => 'Took their revenue from 13 lakhs to 25 lakhs per month', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://hotelskyinternational.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Hotel Rainbow International', 'phone' => '+91 7674866169', 'summary' => 'Ranked them top on Google Profile in Hyderabad', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Hotel SM Rainbow International', 'phone' => '+91 6304789953', 'summary' => 'Ranked them top on Google in Hyderabad', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Hotel Eagle Grand', 'phone' => '+91 8519996179', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Hotel Deccan Park', 'phone' => '+91 9885013915', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Hotel Lake View', 'phone' => '+91 9700888375', 'summary' => 'Took their occupancy from 40% to 75%', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'NTSF India', 'phone' => '+91 8094351810', 'summary' => 'Indian private military forces training platform', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'New Delhi', 'country' => 'India', 'category' => 'Defence & Security'],
            ['company_name' => 'ARK Furniture', 'phone' => '+91 9676586890', 'summary' => 'Local furniture store generated 1000+ leads', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Retail & Home Improvement'],
            ['company_name' => 'Zilma', 'phone' => '+91 8089009060', 'summary' => 'Next gen POS system made in India', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://www.zilmahq.com/', 'city' => 'Kochi', 'country' => 'India', 'category' => 'SaaS & FinTech'],
            ['company_name' => 'Khalijeb', 'phone' => '+91 9565039269', 'summary' => 'Next gen voucher supply SaaS product', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'SaaS'],
            ['company_name' => 'Zepto', 'phone' => '+91 9949214923', 'summary' => 'Did their marketing to get more customers', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Mumbai', 'country' => 'India', 'category' => 'Quick Commerce'],
            ['company_name' => 'Airbeeusa', 'phone' => '+91 9741858689', 'summary' => 'Smoke shop in USA', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Retail'],
            ['company_name' => 'Forklyft', 'phone' => '+91 8505860141', 'summary' => 'White label CRM Platform', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Global', 'country' => 'USA', 'category' => 'SaaS & CRM'],
            ['company_name' => 'Ekidz', 'phone' => '+91 8128477630', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Education & Apparel'],
            ['company_name' => 'Al-Haya', 'phone' => '+1 (954) 608-1866', 'summary' => 'Islamic academy based in USA, zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://alhayaschool.com/', 'city' => 'Florida', 'country' => 'USA', 'category' => 'Education & Non-Profit'],
            ['company_name' => 'Hotel Meredian', 'phone' => '+91 8008433015', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Ojays Paying Guest', 'phone' => '+91 9701018032', 'summary' => 'Helped them get initial push in market launch', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Real Estate & PG'],
            ['company_name' => 'Better Inn', 'phone' => '+91 9666879025', 'summary' => 'Helped them get initial push in market launch', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'GR Conventions', 'phone' => '+91 9000363561', 'summary' => 'Helped them get initial push in market launch', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Event Venues'],
            ['company_name' => 'Kamareddy Local TV', 'phone' => '+91 6302948747', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Kamareddy', 'country' => 'India', 'category' => 'Media & Broadcasting'],
            ['company_name' => 'Indurvaartha', 'phone' => '+91 8500623590', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://indurvaartha.com/', 'city' => 'Nizamabad', 'country' => 'India', 'category' => 'Media & Publishing'],
            ['company_name' => 'Crazee Marios', 'phone' => '+1 (561) 294-3062', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://crazeemario.com', 'city' => 'Florida', 'country' => 'USA', 'category' => 'Restaurants & Gaming'],
            ['company_name' => 'Kinetic Merchandise', 'phone' => '+91 9121705936', 'summary' => 'Designed their logo for merchandise shop', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Apparel & Branding'],
            ['company_name' => 'Linkit Marketing', 'phone' => '+91 9121705936', 'summary' => 'Designed their logo for marketing agency', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Marketing Services'],
            ['company_name' => 'Xverse Meta', 'phone' => '+91 7993493883', 'summary' => 'Designed their logo for AR VR Company', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'AR/VR Tech'],
            ['company_name' => 'Rejolt Edtech', 'phone' => '+91 7989763304', 'summary' => 'Helped them get initial push in market launch', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'EdTech'],
            ['company_name' => 'BITS Hyderabad (E-Cell)', 'phone' => '+91 8830145744', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://www.ecellbphc.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Education & Entrepreneurship'],
            ['company_name' => 'Decent Lodge', 'phone' => '+91 9505644081', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Decent Guest House', 'phone' => '+91 7661902335', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Startic Field', 'phone' => '+91 8074025436', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Sports & Events'],
            ['company_name' => 'Unacademy', 'phone' => '+91 8876382117', 'summary' => 'Helped them get 2000+ students enrolled on big edtech platform of India', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Bengaluru', 'country' => 'India', 'category' => 'EdTech'],
            ['company_name' => 'Teak Work India', 'phone' => '+91 9755234811', 'summary' => 'Helped them make ₹10Cr+ in revenue within a year', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://teakworkindia.com', 'city' => 'Indore', 'country' => 'India', 'category' => 'Furniture & E-Commerce'],
            ['company_name' => 'Honeybees', 'phone' => '+91 9603732800', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Food & Retail'],
            ['company_name' => 'Anartech', 'phone' => '+91 9731998030', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Bengaluru', 'country' => 'India', 'category' => 'Technology'],
            ['company_name' => 'Power Honeys', 'phone' => '+91 9392639979', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Food & Health'],
            ['company_name' => 'Rishi Event Management', 'phone' => '+91 7702265556', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Events'],
            ['company_name' => 'Rishi Musical Events', 'phone' => '+91 7702765556', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Events & Music'],
            ['company_name' => 'Vizeuphonic Musical Events', 'phone' => '+91 9177638282', 'summary' => 'Designed logo for them', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Events & Music'],
            ['company_name' => 'Dawat .com', 'phone' => '+91 9505133892', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://dawats.com', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Catering & Events'],
            ['company_name' => 'Sri Abhida Junior College', 'phone' => '+91 7729077450', 'summary' => 'Made website and logo', 'services' => ['Web Dev', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Education'],
            ['company_name' => 'Vardhaman College of Engineering', 'phone' => '+91 9701526805', 'summary' => 'Got them more than 1M+ views across platforms', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => 'https://vardhaman.org/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'TEDx Vardhaman', 'phone' => '+91 9866758870', 'summary' => 'Got them more than 1M+ views across platforms', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => 'https://tedxvce.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Events & Conferences'],
            ['company_name' => 'Juzstay', 'phone' => '+91 9494818999', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://juzstay.com', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Co-living & PG'],
            ['company_name' => 'Jubaila Studio', 'phone' => '+91 9700560391', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://jubailastudio.com/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Photography & Media'],
            ['company_name' => 'Geetanjali Group of Institutions', 'phone' => '+91 7730069777', 'summary' => 'Got them 200+ admissions in a year', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Education'],
            ['company_name' => 'Functionup School of Computing', 'phone' => '+91 9205891292', 'summary' => 'Did their commercials for marketing and got 1M+ views', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Gurugram', 'country' => 'India', 'category' => 'EdTech'],
            ['company_name' => 'MEPAC Engineering Solutions', 'phone' => '+91 9666165007', 'summary' => 'Designed a website for them', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Engineering Services'],
            ['company_name' => 'Eatmukka', 'phone' => '+91 9346590793', 'summary' => 'Did their launch marketing', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Food & Restaurants'],
            ['company_name' => 'T-Hub', 'phone' => '+91 7842790600', 'summary' => 'Got them 10k+ students enrolled', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => 'https://t-hub.co', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Innovation & Startup Incubator'],
            ['company_name' => 'Rentera', 'phone' => '+1 (973) 706-9606', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://rentera.in', 'city' => 'New Jersey', 'country' => 'USA', 'category' => 'Real Estate & Rentals'],
            ['company_name' => 'Mra Motors', 'phone' => '+91 9701633754', 'summary' => 'Got them 50M+ views and 50k followers on Instagram', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Automotive'],
            ['company_name' => 'Mahindra Motors', 'phone' => '+91 7893372928', 'summary' => 'Did their regional marketing to generate 500+ leads', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Automotive Giant'],
            ['company_name' => 'True Radiations', 'phone' => '+1 (628) 628-4743', 'summary' => 'Got them 10k subscribers on YouTube with 2M+ views', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://trueradiations.com', 'city' => 'California', 'country' => 'USA', 'category' => 'Media & Content'],
            ['company_name' => 'Sri Maha Laxmi Hosiery', 'phone' => '+91 9160955554', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://srimahalaxmihosiery.com', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Apparel & Manufacturing'],
            ['company_name' => 'Cloud9luxurysalon', 'phone' => '+91 7799427778', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Web Dev', 'Graphic Designing'], 'website_url' => 'https://cloud9luxurysalons.com', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Beauty & Wellness'],
            ['company_name' => 'Miamiboatlifts', 'phone' => '+1 (786) 641-7473', 'summary' => 'Designed a website and logo', 'services' => ['Web Dev', 'Graphic Designing'], 'website_url' => null, 'city' => 'Miami', 'country' => 'USA', 'category' => 'Marine Services'],
            ['company_name' => 'Offrrocker', 'phone' => '+1 (305) 281-0709', 'summary' => 'Designed a website and logo', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Miami', 'country' => 'USA', 'category' => 'Lifestyle & E-Commerce'],
            ['company_name' => 'Dentistpro', 'phone' => '+91 7815912486', 'summary' => 'Designed a website and logo', 'services' => ['Web Dev', 'Graphic Designing'], 'website_url' => 'https://dentistpro.in', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Healthcare & Dental'],
            ['company_name' => 'Garragewala', 'phone' => '+91 7702234395', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Automotive Services'],
            ['company_name' => 'Maharshi Studios', 'phone' => '+91 9700542564', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Media & Production'],
            ['company_name' => 'BRS Party', 'phone' => '+91 7013651989', 'summary' => 'Designed a party App for political campaign', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Political & Public Sector'],
            ['company_name' => 'Glampinn Valley', 'phone' => '+91 9988299998', 'summary' => 'Generated 50+ crore in revenue, 30M+ views, 30k followers', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://glampinnvalley.com', 'city' => 'Manali', 'country' => 'India', 'category' => 'Resorts & Hospitality'],
            ['company_name' => 'Omnilabz', 'phone' => null, 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Technology'],
            ['company_name' => 'UPM Bike Service', 'phone' => '+91 7036475271', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Automotive Services'],
            ['company_name' => 'Mango Tree Farm House', 'phone' => '+91 9440140996', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality & Resorts'],
            ['company_name' => 'Telangana Dental Hospital', 'phone' => '+91 7993493883', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Healthcare'],
            ['company_name' => 'Ki Labs', 'phone' => '+91 7729077405', 'summary' => 'Designed shareable graphics for them', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Technology'],
            ['company_name' => 'KPRIT', 'phone' => '+61 452-273-962', 'summary' => 'Took them from zero digital to full digital in engineering college segment', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'Dopesoul', 'phone' => '+91 9121705936', 'summary' => 'Took them from zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://dopesoul.in', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Apparel & Lifestyle'],
            ['company_name' => 'Ojas Hostel', 'phone' => '+91 9701018032', 'summary' => 'Took them from zero digital to full digital', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Accommodation'],
            ['company_name' => 'CMR Medical College', 'phone' => '+91 9000787767', 'summary' => 'Top medical college in Hyderabad, complete digital management', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://cmrims.co.in', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'CMR Group of Institutions', 'phone' => '+91 9177958777', 'summary' => 'Top university group in Hyderabad', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://cmrgroup.edu.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'CMR College of Engineering and Technology', 'phone' => '+91 7675836635', 'summary' => 'Top engineering college in Hyderabad, complete digital management', 'services' => ['Web Dev', 'Marketing'], 'website_url' => 'https://cmrcet.ac.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'La Forest', 'phone' => '+91 8008000264', 'summary' => 'Took their revenue from 15 lakhs a month to 20 lakhs in 3 months', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Medi Care Pharmacy', 'phone' => '+592 600-2101', 'summary' => 'Increased their footfall by 50% in Guyana', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Georgetown', 'country' => 'Guyana', 'category' => 'Healthcare & Retail'],
            ['company_name' => 'Mozac', 'phone' => '+1 (786) 245-6014', 'summary' => 'Took them from zero digital to full digital, BRAND based in USA', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://worldofmozac.com', 'city' => 'Florida', 'country' => 'USA', 'category' => 'Fashion & Lifestyle'],
            ['company_name' => 'Digimo', 'phone' => '+1 (305) 803-6939', 'summary' => 'Took them from zero to full digital as digital marketing agency', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Miami', 'country' => 'USA', 'category' => 'Agency Services'],
            ['company_name' => 'Besure', 'phone' => '+91 9393369669', 'summary' => 'Took them from zero to full digital, outsources work to us', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://besure.today', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Services Outsourcing'],
            ['company_name' => 'Flavour of India', 'phone' => '+1 (561) 317-7332', 'summary' => 'Took them from zero to full digital and ranked them top on Florida restaurants', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Restaurants'],
            ['company_name' => 'Realtor Shakir', 'phone' => '+1 (561) 351-6163', 'summary' => "Florida's top realtor, took him from zero digital to full digital", 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Real Estate'],
            ['company_name' => 'Casa Nuvo Investments', 'phone' => '+1 (954) 326-9537', 'summary' => "Guyana's No.1 realty firm. We help them in everything digital", 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Georgetown', 'country' => 'Guyana', 'category' => 'Real Estate'],
            ['company_name' => 'Al Hikmat', 'phone' => '+1 (954) 608-1866', 'summary' => 'Non-profit firm helped them grow digitally based in USA', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Non-Profit'],
            ['company_name' => 'Al Ameen', 'phone' => '+1 (561) 212-5941', 'summary' => 'Non-profit firm helped them grow digitally based in USA', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Non-Profit'],
            ['company_name' => 'Amazing Bins', 'phone' => '+1 (226) 347-5552', 'summary' => "Canada's top bin store with multiple stores", 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Ontario', 'country' => 'Canada', 'category' => 'Retail Chain'],
            ['company_name' => 'Limitless Marine Services', 'phone' => '+1 (239) 398-7818', 'summary' => "Florida's top marine store & service company, designed logo", 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Marine Services'],
            ['company_name' => 'Veros Heros', 'phone' => '+1 (561) 507-8330', 'summary' => 'Designed their menu based in USA', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Restaurants'],
            ['company_name' => 'CIPAC', 'phone' => '+1 (917) 592-6903', 'summary' => 'Cultural school based in USA, designed website', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'New York', 'country' => 'USA', 'category' => 'Cultural Education'],
            ['company_name' => 'Xpressions', 'phone' => '+1 (561) 797-1134', 'summary' => 'Dancing school based in USA, took from zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Dance & Arts'],
            ['company_name' => 'Happy Jacks Training', 'phone' => '+1 (856) 834-9016', 'summary' => 'New York startup pet training centre, helped grow high', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'New York', 'country' => 'USA', 'category' => 'Pet Care & Services'],
            ['company_name' => 'Hannahs Kitchen', 'phone' => '+1 (561) 609-9993', 'summary' => 'Florida Mediterranean restaurant, took from zero to full', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Restaurants'],
            ['company_name' => 'PK Bin Store', 'phone' => '+1 (561) 908-4333', 'summary' => 'Bin store in Florida, helped grow online', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Retail'],
            ['company_name' => 'Arab India Grocery', 'phone' => '+1 (561) 843-2801', 'summary' => 'Grocery store in Florida, helped grow online', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Grocery & Retail'],
            ['company_name' => 'Ali Bhojani', 'phone' => '+1 (407) 921-1323', 'summary' => "Florida's realtor/mayor, helped in all campaigns", 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Public Figures & Campaigns'],
            ['company_name' => 'Teak Studio', 'phone' => '+91 7278887776', 'summary' => 'Helped generate ₹30Cr+ revenue in 1 year', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Interior & Furniture'],
            ['company_name' => 'Mana Saampradaaya', 'phone' => '+91 9133930006', 'summary' => 'Helped launch online', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Retail & Apparel'],
            ['company_name' => 'Gopuppy', 'phone' => '+91 9348903103', 'summary' => 'Helped scale from single store to franchise with ₹15 Cr in revenue', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Pet Care Franchise'],
            ['company_name' => 'Little Scholars High School', 'phone' => '+91 9666654448', 'summary' => 'Zero to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'Star Banquet Hall', 'phone' => '+91 7995857636', 'summary' => 'Zero to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Event Venues'],
            ['company_name' => 'Mercy Delivered', 'phone' => '+1 (630) 447-9025', 'summary' => 'Zero to full digital based in New York', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'New York', 'country' => 'USA', 'category' => 'Services'],
            ['company_name' => 'Smoke Daddy', 'phone' => '+1 (631) 568-3335', 'summary' => 'Zero to full digital based in Florida', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Retail'],
            ['company_name' => 'Santa Tobacco', 'phone' => '+1 (631) 568-3335', 'summary' => 'Zero to full digital based in Florida', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Retail'],
            ['company_name' => 'Hookah Man Shop', 'phone' => '+1 (954) 802-1216', 'summary' => 'Zero to full digital based in Florida', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Retail'],
            ['company_name' => 'Curlvee', 'phone' => '+91 9848427530', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Personal Care & Beauty'],
            ['company_name' => 'Best Near Me', 'phone' => '+91 9701633754', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Local Directory & Tech'],
            ['company_name' => 'Pet Store Hyderabad', 'phone' => '+91 8801109752', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Pet Care'],
            ['company_name' => 'Elahi Catering', 'phone' => '+91 9100407623', 'summary' => 'Zero to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Catering & Events'],
            ['company_name' => 'MailPro Solutions', 'phone' => '+1 (954) 451-4475', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Logistics & Tech'],
            ['company_name' => 'Global Equipments', 'phone' => '+91 9700456426', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://globalequipmentsindia.com/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Industrial Equipment'],
            ['company_name' => 'Jignas High School', 'phone' => '+91 9246243925', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Graphic Designing'], 'website_url' => 'https://jignasschool.com/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'CMR Group of Schools', 'phone' => '+91 9393369669', 'summary' => '100+ schools in Hyderabad, managing 5 schools with full digital support', 'services' => ['Web Dev', 'Graphic Designing'], 'website_url' => 'https://cmrgroupofschools.in/', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'Tome International School', 'phone' => '+91 6301279998', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'Geo Tens', 'phone' => '+91 8977007474', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Services'],
            ['company_name' => 'BPL Baseball Malaysia', 'phone' => '+60 10-227-6014', 'summary' => 'Zero to full digital, top baseball league in Malaysia', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Kuala Lumpur', 'country' => 'Malaysia', 'category' => 'Sports League'],
            ['company_name' => 'Embun Teratai', 'phone' => '+60 3-8687-8421', 'summary' => 'Zero to full digital, best halal confinement centre in Malaysia', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Kuala Lumpur', 'country' => 'Malaysia', 'category' => 'Maternal Healthcare'],
            ['company_name' => 'Nexdesk', 'phone' => '+91 9010185859', 'summary' => 'Zero to full digital, most affordable coworking space in Hyderabad', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Coworking Space'],
            ['company_name' => 'E Tech Repair', 'phone' => '+91 7997118832', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Electronics Repair'],
            ['company_name' => 'SS Baby City', 'phone' => '+91 7842973394', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Retail'],
            ['company_name' => 'SS Global Equipments', 'phone' => '+91 9849461986', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Industrial Equipment'],
            ['company_name' => 'Khudrat', 'phone' => '+91 7995832323', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Organic & Retail'],
            ['company_name' => 'Aakash Institute', 'phone' => '+91 9927400089', 'summary' => 'Zero to full digital leading to 200+ new admissions in a year', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Coaching & Test Prep'],
            ['company_name' => 'Saadhya Global School', 'phone' => '+91 8121125347', 'summary' => 'Zero to full digital leading to 50+ new admissions in a year', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'Nexhouz', 'phone' => '+91 8585854853', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Real Estate & PG'],
            ['company_name' => 'TKR Group of Institutions', 'phone' => '+91 9701002179', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'Quick Cell Repair', 'phone' => '+1 (672) 699-4482', 'summary' => 'Zero to full digital based in Vancouver, Canada', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Vancouver', 'country' => 'Canada', 'category' => 'Electronics Repair'],
            ['company_name' => 'PhoneEra', 'phone' => '+1 (226) 978-1918', 'summary' => 'Zero to full digital based in Vancouver, Canada', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Vancouver', 'country' => 'Canada', 'category' => 'Electronics Repair'],
            ['company_name' => 'Brewed Roots', 'phone' => '+1 (910) 751-4335', 'summary' => 'Zero to full digital based in New York', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'New York', 'country' => 'USA', 'category' => 'Coffee & Beverages'],
            ['company_name' => 'Flame Japanese Hibachi', 'phone' => '+1 (845) 866-8401', 'summary' => 'Zero to full digital based in Virginia, USA', 'services' => ['Marketing'], 'website_url' => null, 'city' => 'Virginia', 'country' => 'USA', 'category' => 'Restaurants'],
            ['company_name' => 'Dayanas Mobile Per Service', 'phone' => '+1 (919) 740-2276', 'summary' => 'Zero to full digital based in New York, USA', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'New York', 'country' => 'USA', 'category' => 'Services'],
            ['company_name' => 'Scrapwala Hyderabad', 'phone' => '+91 9652298400', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Recycling & Scrap'],
            ['company_name' => 'Global Scrap Metals', 'phone' => '+91 8121364878', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Recycling & Scrap'],
            ['company_name' => 'Scrapcycle Hyderabad', 'phone' => '+91 8121364878', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Recycling & Scrap'],
            ['company_name' => 'Deluxe Scrap', 'phone' => '+91 7093397598', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Recycling & Scrap'],
            ['company_name' => 'MR Scrap', 'phone' => '+91 9160488320', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Recycling & Scrap'],
            ['company_name' => 'Hydi Resort', 'phone' => '+91 8688730089', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality & Resorts'],
            ['company_name' => 'Vintage Bougan Villas', 'phone' => '+91 7842860999', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Real Estate & Resorts'],
            ['company_name' => 'Mangowood Jalsa', 'phone' => '+91 9949034673', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Resorts & Venues'],
            ['company_name' => 'Elixir Artistry', 'phone' => '+91 9347820728', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Beauty & Wellness'],
            ['company_name' => 'Wellspire International School', 'phone' => '+91 9988331711', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'My Expat', 'phone' => '+60 14-372-3431', 'summary' => 'Zero to full digital based in Malaysia, top visa firm in Malaysia', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Kuala Lumpur', 'country' => 'Malaysia', 'category' => 'Immigration & Visa'],
            ['company_name' => 'Fura Furniture', 'phone' => '+1 (904) 775-2222', 'summary' => 'Zero to full digital based in USA, franchise business', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Furniture Franchise'],
            ['company_name' => 'Edu Lens', 'phone' => '+91 7075775936', 'summary' => 'Logo & marketing', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Education Services'],
            ['company_name' => 'C9 Spots', 'phone' => '+91 7075775936', 'summary' => 'Logo design', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Sports & Branding'],
            ['company_name' => 'Visionary Junior and Degree College', 'phone' => '+91 6301279998', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Higher Education'],
            ['company_name' => 'Deccan Biryani House', 'phone' => '+61 424-618-966', 'summary' => 'Zero to full digital based in Australia', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Sydney', 'country' => 'Australia', 'category' => 'Restaurants'],
            ['company_name' => 'Lady Care Beauty Parlour', 'phone' => '+91 9014344248', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Beauty Parlour'],
            ['company_name' => 'Juice Salon', 'phone' => '+91 8688730089', 'summary' => 'Zero to full digital, responsible to handle Google profile across Hyderabad', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Salon Chain'],
            ['company_name' => 'Persis Cafe', 'phone' => '+91 924635777', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Cafes & Restaurants'],
            ['company_name' => 'Broadway Cafe', 'phone' => '+91 924635777', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Cafes & Restaurants'],
            ['company_name' => 'Plants Kingdom', 'phone' => '+91 9676552878', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Nursery & Plants'],
            ['company_name' => 'Do Plant', 'phone' => '+91 9004106504', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Mumbai', 'country' => 'India', 'category' => 'Nursery & Plants'],
            ['company_name' => 'Plant Paradise', 'phone' => '+91 9004106504', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Mumbai', 'country' => 'India', 'category' => 'Nursery & Plants'],
            ['company_name' => 'Palm Cottage', 'phone' => '+91 9885901657', 'summary' => 'Zero to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality & Resorts'],
            ['company_name' => 'ICCGFL', 'phone' => '+1 (352) 219-3251', 'summary' => 'Non-profit firm helped them grow digitally based in USA', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Non-Profit'],
            ['company_name' => 'PolisIQ', 'phone' => '+91 9885008194', 'summary' => 'Zero to full digital', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Technology'],
            ['company_name' => 'Solvr Solutions', 'phone' => '+91 9620108175', 'summary' => 'Zero to full digital', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Bengaluru', 'country' => 'India', 'category' => 'IT Services'],
            ['company_name' => 'Z6R Shoes', 'phone' => '+91 9966176371', 'summary' => 'Zero to full digital', 'services' => ['Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Footwear & Retail'],
            ['company_name' => 'Student First Overseas', 'phone' => '+91 9959929653', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Overseas Education'],
            ['company_name' => 'Hrisha Interiors', 'phone' => '+91 9630592535', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Interior Design'],
            ['company_name' => 'COTS USA Visa', 'phone' => '+91 9885248070', 'summary' => 'Created an Automated US Scheduling visa bot', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Automation & Visa Services'],
            ['company_name' => 'COTS Ticketing', 'phone' => '+91 9885348070', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Travel & Ticketing'],
            ['company_name' => 'Waste Management Shaheed', 'phone' => '+91 9652298400', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Environmental Services'],
            ['company_name' => 'Hotel Oak by Mega Group', 'phone' => '+91 9848937313', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Hospitality'],
            ['company_name' => 'Desi Pakwaan', 'phone' => '+91 9346468248', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Restaurants'],
            ['company_name' => 'Sheshadri Medical', 'phone' => null, 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Healthcare'],
            ['company_name' => 'r9 Convention', 'phone' => '+91 9000200918', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Convention Centers'],
            ['company_name' => 'Lady Fauzia', 'phone' => '+1 (305) 803-6939', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Miami', 'country' => 'USA', 'category' => 'Fashion & Lifestyle'],
            ['company_name' => 'Merch BPL Baseball', 'phone' => '+1 (786) 245-6014', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'Merchandise & Sports'],
            ['company_name' => 'BRIQ Pre School', 'phone' => '+1 (949) 562-2267', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'California', 'country' => 'USA', 'category' => 'Early Education'],
            ['company_name' => 'Sistla International School', 'phone' => '+91 9059346327', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'Ybrant Global School', 'phone' => '+91 6304607348', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'School Education'],
            ['company_name' => 'Amego Classique Home Studio', 'phone' => '+91 9885357772', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Interior & Home Studio'],
            ['company_name' => 'ichatup', 'phone' => '+91 7997001700', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Tech & Messaging'],
            ['company_name' => 'invitivals', 'phone' => '+91 9505652923', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => 'https://invitivals.com', 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Event Digital Invitations'],
            ['company_name' => 'Dyana Mobile Per Services', 'phone' => '+1 (919) 740-2276', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'New York', 'country' => 'USA', 'category' => 'Services'],
            ['company_name' => 'Etch a Memory Shopify Site', 'phone' => '+1 (954) 496-1316', 'summary' => 'Enhanced Shopify Website', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Florida', 'country' => 'USA', 'category' => 'E-Commerce'],
            ['company_name' => 'Beyond the Shore', 'phone' => '+91 9963734499', 'summary' => 'Zero to full digital', 'services' => ['Web Dev', 'Marketing', 'Graphic Designing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'Travel & Leisure'],
            ['company_name' => 'Henosistech Solutions', 'phone' => '+91 6281473484', 'summary' => 'Email backups restoration and website development', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'IT Infrastructure'],
            ['company_name' => 'DG Consultancy', 'phone' => '+592 657-8054', 'summary' => 'Website development for client from Guyana C.A.', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Georgetown', 'country' => 'Guyana', 'category' => 'Consulting'],
            ['company_name' => 'Shield Lock and Key Australia', 'phone' => '+61 422-207-815', 'summary' => 'Website development in Australia', 'services' => ['Web Dev'], 'website_url' => null, 'city' => 'Sydney', 'country' => 'Australia', 'category' => 'Locksmith & Security'],
            ['company_name' => 'Deccan Morsells USA', 'phone' => '+91 7995532482', 'summary' => 'Logo design for a Hyderabadi restaurant in Texas', 'services' => ['Graphic Designing'], 'website_url' => null, 'city' => 'Texas', 'country' => 'USA', 'category' => 'Restaurants'],
            ['company_name' => 'Core Origin', 'phone' => '+91 9110787692', 'summary' => 'Email Marketing automation for a manpower hiring agency', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Hyderabad', 'country' => 'India', 'category' => 'HR & Staffing'],
            ['company_name' => 'Elite Architecture', 'phone' => '+56 2618-9518', 'summary' => 'Developed website and Google profile', 'services' => ['Web Dev', 'Marketing'], 'website_url' => null, 'city' => 'Santiago', 'country' => 'Chile', 'category' => 'Architecture & Design'],
        ];
    }
}
