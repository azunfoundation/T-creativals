<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('employee_compensations')
            ->where('expected_monthly_hours', 160.00)
            ->update(['expected_monthly_hours' => 200.00]);
    }

    public function down(): void
    {
        DB::table('employee_compensations')
            ->where('expected_monthly_hours', 200.00)
            ->update(['expected_monthly_hours' => 160.00]);
    }
};
