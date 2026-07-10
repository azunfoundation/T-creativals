<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Allowed origins MUST be explicit (not wildcard) when supports_credentials
    | is true — the CORS spec forbids wildcard + credentials together.
    |
    | Set ALLOWED_ORIGINS in .env (comma-separated list):
    |   ALLOWED_ORIGINS=http://localhost:3000,https://app.creativals.com
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Explicit origins only — no wildcard when credentials=true
    'allowed_origins' => array_filter(
        explode(',', env('ALLOWED_ORIGINS', 'http://localhost:3000'))
    ),

    // Pattern fallback for subdomains (e.g. staging envs)
    'allowed_origins_patterns' => array_filter(
        explode(',', env('ALLOWED_ORIGINS_PATTERNS', ''))
    ),

    'allowed_headers' => ['*'],

    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 3600,

    'supports_credentials' => true,

];

