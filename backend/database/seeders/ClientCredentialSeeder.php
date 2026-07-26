<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\ClientCredential;
use Illuminate\Support\Facades\Hash;

class ClientCredentialSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Clean existing credentials to prevent duplication if re-run
        ClientCredential::truncate();

        // Find or create apex solutions client
        $apex = User::role('client')->where('company_name', 'Apex Solutions')->first();
        if (!$apex) {
            $apex = User::create([
                'name' => 'Rajesh Apex',
                'company_name' => 'Apex Solutions',
                'email' => 'apex@creativals.com',
                'password' => Hash::make('password'),
                'status' => 'active',
                'phone' => '+15551000',
                'is_client_portal_user' => true,
            ]);
            $apex->assignRole('client');
        }

        // Find or create globotech client
        $globo = User::role('client')->where('company_name', 'Globotech')->first();
        if (!$globo) {
            $globo = User::create([
                'name' => 'Globotech Admin',
                'company_name' => 'Globotech',
                'email' => 'globotech@creativals.com',
                'password' => Hash::make('password'),
                'status' => 'active',
                'phone' => '+15552000',
                'is_client_portal_user' => true,
            ]);
            $globo->assignRole('client');
        }

        $credentials = [
            [
                'is_favorite' => true,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'WordPress Admin',
                'credential_type' => 'Website',
                'username' => 'admin_apex',
                'password' => 'adminpass123',
                'login_url' => 'https://www.apex.com/wp-admin',
                'notes' => 'Primary WordPress administrator account.',
                'tags' => 'Production,WordPress',
                'last_used_at' => now()->subHours(2),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'cPanel Hosting',
                'credential_type' => 'Hosting',
                'username' => 'cpaneluser',
                'password' => 'cpanelpass123',
                'login_url' => 'https://cpanel.apex.com',
                'notes' => 'Hosting control panel access details.',
                'tags' => 'Main Server',
                'last_used_at' => now()->subHours(5),
            ],
            [
                'is_favorite' => true,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'Google Ads',
                'credential_type' => 'Advertising',
                'username' => 'apexads@gmail.com',
                'password' => 'googpass123',
                'login_url' => 'https://ads.google.com',
                'notes' => 'Google Adwords dashboard login.',
                'tags' => 'PPC Campaign',
                'last_used_at' => now()->subDays(1),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'Facebook Business',
                'credential_type' => 'Social Media',
                'username' => 'marketing@apex.com',
                'password' => 'fbpass123',
                'login_url' => 'https://business.facebook.com',
                'notes' => 'Facebook Business Manager login.',
                'tags' => 'BM Access',
                'last_used_at' => now()->subDays(2),
            ],
            [
                'is_favorite' => true,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'Stripe Account',
                'credential_type' => 'Payment',
                'username' => 'billing@apex.com',
                'password' => 'stripepass123',
                'login_url' => 'https://dashboard.stripe.com',
                'notes' => 'Stripe dashboard merchant portal.',
                'tags' => 'Live Account',
                'last_used_at' => now()->subDays(3),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'Google Analytics',
                'credential_type' => 'Analytics',
                'username' => 'analytics@apex.com',
                'password' => 'gapass123',
                'login_url' => 'https://analytics.google.com',
                'notes' => 'Google Analytics property details.',
                'tags' => 'All Web Data',
                'last_used_at' => now()->subDays(4),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Globotech',
                'client_id' => $globo->id,
                'platform' => 'Cloudflare',
                'credential_type' => 'Security',
                'username' => 'admin@globotech.com',
                'password' => 'cfpass123',
                'login_url' => 'https://dash.cloudflare.com',
                'notes' => 'DNS routing and SSL keys.',
                'tags' => 'DNS + SSL',
                'last_used_at' => now()->subDays(5),
            ],
            [
                'is_favorite' => true,
                'client_name' => 'Globotech',
                'client_id' => $globo->id,
                'platform' => 'Zoho Mail',
                'credential_type' => 'Email',
                'username' => 'info@globotech.com',
                'password' => 'zohopass123',
                'login_url' => 'https://mail.zoho.com',
                'notes' => 'Business mail server credentials.',
                'tags' => 'Business Mail',
                'last_used_at' => now()->subDays(6),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Globotech',
                'client_id' => $globo->id,
                'platform' => 'SSH Access',
                'credential_type' => 'Server',
                'username' => 'deploy',
                'password' => 'sshpass123',
                'login_url' => 'ssh://ssh.globotech.com',
                'notes' => 'Direct server SSH terminal access.',
                'tags' => 'Root Access',
                'last_used_at' => now()->subDays(7),
            ],
            [
                'is_favorite' => true,
                'client_name' => 'Globotech',
                'client_id' => $globo->id,
                'platform' => 'Shopify Store',
                'credential_type' => 'E-commerce',
                'username' => 'store@globotech.com',
                'password' => 'shoppass123',
                'login_url' => 'https://globotech.myshopify.com',
                'notes' => 'Shopify merchant login.',
                'tags' => 'Main Store',
                'last_used_at' => now()->subDays(8),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'SendGrid API Key',
                'credential_type' => 'API Key',
                'username' => 'apikey',
                'password' => 'SG.apikey123',
                'login_url' => 'https://sendgrid.com',
                'notes' => 'Sendgrid transactional SMTP key.',
                'tags' => 'Transactional',
                'last_used_at' => now()->subDays(9),
            ],
            [
                'is_favorite' => false,
                'client_name' => 'Apex Solutions',
                'client_id' => $apex->id,
                'platform' => 'FTP Access',
                'credential_type' => 'FTP',
                'username' => 'ftpuser',
                'password' => 'ftppass123',
                'login_url' => 'ftp://ftp.apex.com',
                'notes' => 'Asset uploads server directory details.',
                'tags' => 'Uploads',
                'last_used_at' => now()->subDays(10),
            ],
        ];

        foreach ($credentials as $item) {
            ClientCredential::create($item);
        }
    }
}
