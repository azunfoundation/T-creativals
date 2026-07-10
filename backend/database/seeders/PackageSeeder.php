<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Currency;
use App\Models\Package;
use App\Models\Service;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PackageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $inr = Currency::where('code', 'INR')->first() ?? Currency::first();
        $inrId = $inr ? $inr->id : 1;

        $seoAudit = Service::where('slug', 'seo-audit')->first();
        $blogCopywriting = Service::where('slug', 'blog-copywriting')->first();
        $nextjsSite = Service::where('slug', 'custom-next-js-site')->first();
        $logoDesign = Service::where('slug', 'logo-identity-design')->first();

        // Package 1: SEO + Content Starter Package
        $package1 = Package::updateOrCreate(
            ['slug' => 'seo-content-starter-package'],
            [
                'name' => 'SEO + Content Starter Package',
                'description' => 'Perfect package for getting started with SEO and copywriting.',
                'price' => 15000.00,
                'currency_id' => $inrId,
                'billing_cycle' => 'monthly',
                'is_active' => true,
                'is_featured' => true,
            ]
        );

        $p1Services = [];
        if ($seoAudit) {
            $p1Services[$seoAudit->id] = [
                'custom_price' => 10000.00,
                'quantity' => 1,
                'description' => 'Initial monthly SEO audit.',
            ];
        }
        if ($blogCopywriting) {
            $p1Services[$blogCopywriting->id] = [
                'custom_price' => 2500.00,
                'quantity' => 2,
                'description' => '2x SEO-optimized blog posts per month.',
            ];
        }
        if (!empty($p1Services)) {
            $package1->services()->sync($p1Services);
        }

        // Package 2: Premium E-Commerce Build
        $package2 = Package::updateOrCreate(
            ['slug' => 'premium-e-commerce-build'],
            [
                'name' => 'Premium E-Commerce Build',
                'description' => 'Bespoke Next.js site development with custom logo branding.',
                'price' => 160000.00,
                'currency_id' => $inrId,
                'billing_cycle' => 'one_time',
                'is_active' => true,
                'is_featured' => false,
            ]
        );

        $p2Services = [];
        if ($nextjsSite) {
            $p2Services[$nextjsSite->id] = [
                'custom_price' => 140000.00,
                'quantity' => 1,
                'description' => 'Custom Next.js high performance store front.',
            ];
        }
        if ($logoDesign) {
            $p2Services[$logoDesign->id] = [
                'custom_price' => 20000.00,
                'quantity' => 1,
                'description' => 'Custom logo and identity pack.',
            ];
        }
        if (!empty($p2Services)) {
            $package2->services()->sync($p2Services);
        }
    }
}
