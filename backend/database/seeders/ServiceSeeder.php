<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Currency;
use App\Models\Service;
use App\Models\ServiceCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ServiceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $inr = Currency::where('code', 'INR')->first() ?? Currency::first();
        $inrId = $inr ? $inr->id : 1;

        $catMarketing = ServiceCategory::where('slug', 'digital-marketing')->first()?->id;
        $catDevelopment = ServiceCategory::where('slug', 'development')->first()?->id;
        $catBranding = ServiceCategory::where('slug', 'branding')->first()?->id;
        $catCopywriting = ServiceCategory::where('slug', 'copywriting')->first()?->id;

        $services = [
            [
                'name' => 'SEO Audit',
                'category_id' => $catMarketing,
                'description' => 'Comprehensive SEO analysis and recommendations.',
                'default_price' => 15000.00,
                'billing_type' => 'fixed',
                'unit' => 'audit',
            ],
            [
                'name' => 'Social Media Management',
                'category_id' => $catMarketing,
                'description' => 'Monthly management of up to 3 social accounts.',
                'default_price' => 25000.00,
                'billing_type' => 'monthly',
                'unit' => 'month',
            ],
            [
                'name' => 'Custom Next.js Site',
                'category_id' => $catDevelopment,
                'description' => 'Bespoke high-performance web development.',
                'default_price' => 150000.00,
                'billing_type' => 'fixed',
                'unit' => 'project',
            ],
            [
                'name' => 'Logo Identity Design',
                'category_id' => $catBranding,
                'description' => 'Professional typography and symbol branding.',
                'default_price' => 20000.00,
                'billing_type' => 'fixed',
                'unit' => 'logo',
            ],
            [
                'name' => 'Blog Copywriting',
                'category_id' => $catCopywriting,
                'description' => '1000-word SEO-optimized content pieces.',
                'default_price' => 3000.00,
                'billing_type' => 'fixed',
                'unit' => 'article',
            ],
            [
                'name' => 'Cloud Migration Consulting',
                'category_id' => $catDevelopment,
                'description' => 'Architecture strategy and infrastructure setup.',
                'default_price' => 80000.00,
                'billing_type' => 'hourly',
                'unit' => 'hour',
            ],
        ];

        foreach ($services as $srv) {
            Service::updateOrCreate(
                ['slug' => Str::slug($srv['name'])],
                [
                    'category_id' => $srv['category_id'],
                    'name' => $srv['name'],
                    'description' => $srv['description'],
                    'default_price' => $srv['default_price'],
                    'currency_id' => $inrId,
                    'billing_type' => $srv['billing_type'],
                    'unit' => $srv['unit'],
                    'is_active' => true,
                    'is_taxable' => true,
                    'tax_rate' => 18.00,
                ]
            );
        }
    }
}
