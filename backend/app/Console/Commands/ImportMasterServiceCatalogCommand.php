<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Currency;
use App\Models\Service;
use App\Models\ServiceCategory;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class ImportMasterServiceCatalogCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'catalog:import-master-services';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import the Creativals Master Service Catalog (34 services across Marketing, Development, and Branding)';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info("=== IMPORTING CREATIVALS MASTER SERVICE CATALOG ===");

        // Seed currencies if not present
        $this->call('db:seed', ['--class' => 'CurrencySeeder']);

        $inrCurrency = Currency::where('code', 'INR')->first() ?? Currency::first();
        $currencyId = $inrCurrency ? $inrCurrency->id : 1;

        $categoriesData = [
            [
                'name' => 'Marketing & Growth',
                'slug' => 'marketing-growth',
                'color' => '#3B82F6',
                'sort_order' => 1,
                'services' => [
                    [
                        'name' => 'Paid Social Ads',
                        'default_price' => 15000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => 'POPULAR',
                        'description' => 'Meta, Instagram and other paid social advertising campaign management including campaign setup, audience targeting, creative strategy, optimization and performance monitoring.',
                    ],
                    [
                        'name' => 'Google Ads & PPC',
                        'default_price' => 15000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Google Search, Display, Performance Max and other PPC campaign management including keyword research, campaign setup, optimization and reporting.',
                    ],
                    [
                        'name' => 'Search Engine Optimization',
                        'default_price' => 15000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Comprehensive SEO including keyword research, technical optimization, on-page SEO, content recommendations, link-building strategy and performance monitoring.',
                    ],
                    [
                        'name' => 'Local Maps & GBP',
                        'default_price' => 8000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => 'HIGH ROI',
                        'description' => 'Google Business Profile optimization and local SEO designed to improve Google Maps visibility, local rankings, reviews and local customer discovery.',
                    ],
                    [
                        'name' => 'Social Media Management',
                        'default_price' => 15000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Social media strategy, content planning, posting, account management, engagement and performance reporting across relevant social platforms.',
                    ],
                    [
                        'name' => 'Email Marketing',
                        'default_price' => 10000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Email campaign strategy, campaign creation, audience segmentation, newsletters, promotional campaigns, automation setup and performance tracking.',
                    ],
                    [
                        'name' => 'WhatsApp & SMS',
                        'default_price' => 10000.00,
                        'unit' => 'Per Campaign',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'WhatsApp and SMS marketing campaigns including campaign strategy, message creation, customer segmentation and campaign execution.',
                    ],
                    [
                        'name' => 'Lead Generation Funnels',
                        'default_price' => 25000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => 'MOST USED',
                        'description' => 'Complete lead-generation funnel including landing pages, forms, tracking, conversion strategy and lead capture systems.',
                    ],
                    [
                        'name' => 'Conversion Optimization',
                        'default_price' => 20000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Conversion Rate Optimization focused on improving landing pages, websites and funnels to increase leads, enquiries, purchases and overall conversion performance.',
                    ],
                    [
                        'name' => 'Influencer Partnerships',
                        'default_price' => 20000.00,
                        'unit' => 'Per Campaign',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Influencer identification, outreach, campaign planning, negotiation support, coordination and campaign performance tracking.',
                    ],
                ],
            ],
            [
                'name' => 'Development & Systems',
                'slug' => 'development-systems',
                'color' => '#10B981',
                'sort_order' => 2,
                'services' => [
                    [
                        'name' => 'Custom Websites',
                        'default_price' => 50000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => 'POPULAR',
                        'description' => "Fully custom business website designed and developed around the client's brand, goals, user journey and conversion requirements.",
                    ],
                    [
                        'name' => 'High-Converting Landings',
                        'default_price' => 20000.00,
                        'unit' => 'Per Page',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Conversion-focused landing page designed specifically for advertising, lead generation, sales or campaign objectives.',
                    ],
                    [
                        'name' => 'E-commerce Development',
                        'default_price' => 75000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Complete ecommerce store development including product catalog, shopping cart, checkout, payment integration and essential ecommerce functionality.',
                    ],
                    [
                        'name' => 'WordPress Development',
                        'default_price' => 35000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Professional WordPress website development, customization, theme implementation, plugin configuration and CMS setup.',
                    ],
                    [
                        'name' => 'Shopify Development',
                        'default_price' => 50000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Shopify store setup and development including theme customization, product configuration, collections, navigation and ecommerce setup.',
                    ],
                    [
                        'name' => 'WooCommerce Development',
                        'default_price' => 50000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'WooCommerce-powered ecommerce development including store configuration, products, payments, shipping and customization.',
                    ],
                    [
                        'name' => 'Web Application Development',
                        'default_price' => 100000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => 'HIGH ROI',
                        'description' => 'Custom web application development for business workflows, dashboards, SaaS products, portals and specialized web-based systems.',
                    ],
                    [
                        'name' => 'Portal Development',
                        'default_price' => 100000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Custom client, employee, vendor or partner portals with authentication, dashboards, workflows and role-based access.',
                    ],
                    [
                        'name' => 'Mobile Applications',
                        'default_price' => 150000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Custom mobile application development for Android, iOS or cross-platform environments.',
                    ],
                    [
                        'name' => 'CRM Management',
                        'default_price' => 20000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'CRM setup, configuration, maintenance, pipeline management, data organization, workflow improvements and CRM optimization.',
                    ],
                    [
                        'name' => 'Workflow Automations',
                        'default_price' => 25000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => 'MOST USED',
                        'description' => 'Business process automation connecting applications, forms, CRM systems, notifications, databases and internal workflows.',
                    ],
                    [
                        'name' => 'API Integrations',
                        'default_price' => 20000.00,
                        'unit' => 'Per Integration',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Integration of third-party APIs and platforms to connect business systems and automate data exchange.',
                    ],
                    [
                        'name' => 'AI Chatbots',
                        'default_price' => 35000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'AI-powered conversational systems for websites, customer support, lead qualification, FAQs and business workflows.',
                    ],
                    [
                        'name' => 'Hosting & Server Ops',
                        'default_price' => 5000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Hosting management, server configuration, deployment, monitoring, maintenance, backups and basic server operations.',
                    ],
                ],
            ],
            [
                'name' => 'Branding & Creatives',
                'slug' => 'branding-creatives',
                'color' => '#F59E0B',
                'sort_order' => 3,
                'services' => [
                    [
                        'name' => 'Brand Identity',
                        'default_price' => 35000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Complete brand identity system including visual direction, typography, colors, brand guidelines and supporting brand assets.',
                    ],
                    [
                        'name' => 'Logo Design & Animation',
                        'default_price' => 15000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Professional logo design with optional animated logo treatment for digital, video and social media applications.',
                    ],
                    [
                        'name' => 'Direct Response Video',
                        'default_price' => 20000.00,
                        'unit' => 'Per Video',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Performance-focused video production designed to generate enquiries, sales, conversions or direct customer action.',
                    ],
                    [
                        'name' => 'Short-Form Content',
                        'default_price' => 15000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Short-form video content for platforms such as Instagram Reels, YouTube Shorts and other social channels.',
                    ],
                    [
                        'name' => 'Social Media Graphics',
                        'default_price' => 8000.00,
                        'unit' => 'Per Month',
                        'billing_type' => 'monthly',
                        'badge' => null,
                        'description' => 'Professional social media creatives including posts, carousels, promotional graphics, campaign creatives and branded visual content.',
                    ],
                    [
                        'name' => 'UI / UX Interface Design',
                        'default_price' => 30000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'User interface and user experience design for websites, applications, dashboards, portals and digital products.',
                    ],
                    [
                        'name' => 'Copywriting & Scripts',
                        'default_price' => 10000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Conversion-focused website copy, advertising copy, social content, video scripts, sales copy and marketing messaging.',
                    ],
                    [
                        'name' => 'Photography',
                        'default_price' => 15000.00,
                        'unit' => 'Per Session',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Professional product, brand, corporate, event or lifestyle photography for marketing and commercial use.',
                    ],
                    [
                        'name' => 'Pitch Decks',
                        'default_price' => 15000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Professionally designed investor, sales, corporate or business pitch decks with compelling visual storytelling.',
                    ],
                    [
                        'name' => 'Print & Packaging',
                        'default_price' => 15000.00,
                        'unit' => 'Per Project',
                        'billing_type' => 'fixed',
                        'badge' => null,
                        'description' => 'Design of brochures, business materials, packaging, print collateral, labels and other physical brand assets.',
                    ],
                ],
            ],
        ];

        $totalCategories = 0;
        $totalServices = 0;

        foreach ($categoriesData as $catData) {
            $category = ServiceCategory::updateOrCreate(
                ['slug' => $catData['slug']],
                [
                    'name' => $catData['name'],
                    'color' => $catData['color'],
                    'sort_order' => $catData['sort_order'],
                    'is_active' => true,
                ]
            );

            $totalCategories++;
            $this->info("Category ({$totalCategories}): {$category->name}");

            foreach ($catData['services'] as $srvData) {
                $service = Service::updateOrCreate(
                    ['slug' => Str::slug($srvData['name'])],
                    [
                        'category_id' => $category->id,
                        'name' => $srvData['name'],
                        'description' => $srvData['description'],
                        'default_price' => $srvData['default_price'],
                        'currency_id' => $currencyId,
                        'billing_type' => $srvData['billing_type'],
                        'unit' => $srvData['unit'],
                        'badge' => $srvData['badge'],
                        'is_active' => true,
                        'is_taxable' => true,
                        'tax_rate' => 18.00,
                    ]
                );

                $totalServices++;
                $badgeInfo = $srvData['badge'] ? " [Badge: {$srvData['badge']}]" : '';
                $this->line("   - Service #{$totalServices}: {$service->name} (₹" . number_format((float)$service->default_price) . " / {$service->unit}){$badgeInfo}");
            }
        }

        $this->info("✅ SUCCESS: Master Service Catalog imported! Total Categories: {$totalCategories}, Total Services: {$totalServices}");

        return Command::SUCCESS;
    }
}
