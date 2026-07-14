<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();
try {
    $res = app(App\Services\LeadReportService::class)->getPipelineSummary(
        Carbon\Carbon::now()->startOfMonth(),
        Carbon\Carbon::now()->endOfMonth(),
        'created'
    );
    print_r($res);
    echo "SUCCESS\n";
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
