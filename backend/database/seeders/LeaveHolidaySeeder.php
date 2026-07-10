<?php

namespace Database\Seeders;

use App\Models\Holiday;
use App\Models\LeaveType;
use Illuminate\Database\Seeder;

class LeaveHolidaySeeder extends Seeder
{
    public function run(): void
    {
        $types = [
            ['name' => 'Casual Leave', 'code' => 'CL', 'days_allowed' => 12, 'is_paid' => true, 'color' => '#3b82f6'],
            ['name' => 'Sick Leave', 'code' => 'SL', 'days_allowed' => 12, 'is_paid' => true, 'color' => '#ef4444'],
            ['name' => 'Earned Leave', 'code' => 'EL', 'days_allowed' => 15, 'is_paid' => true, 'color' => '#22c55e'],
            ['name' => 'Maternity Leave', 'code' => 'ML', 'days_allowed' => 180, 'is_paid' => true, 'color' => '#ec4899'],
            ['name' => 'Paternity Leave', 'code' => 'PL', 'days_allowed' => 15, 'is_paid' => true, 'color' => '#8b5cf6'],
            ['name' => 'Unpaid Leave', 'code' => 'UL', 'days_allowed' => 0, 'is_paid' => false, 'color' => '#94a3b8'],
        ];
        foreach ($types as $t) {
            LeaveType::firstOrCreate(['code' => $t['code']], $t);
        }
        
        $holidays = [
            ['name' => 'Republic Day', 'date' => '2026-01-26', 'type' => 'national'],
            ['name' => 'Holi', 'date' => '2026-03-25', 'type' => 'national'],
            ['name' => 'Eid ul-Fitr', 'date' => '2026-03-31', 'type' => 'national'],
            ['name' => 'Good Friday', 'date' => '2026-04-18', 'type' => 'national'],
            ['name' => 'Independence Day', 'date' => '2026-08-15', 'type' => 'national'],
            ['name' => 'Gandhi Jayanti', 'date' => '2026-10-02', 'type' => 'national'],
            ['name' => 'Diwali', 'date' => '2026-10-20', 'type' => 'national'],
            ['name' => 'Christmas', 'date' => '2026-12-25', 'type' => 'national'],
        ];
        foreach ($holidays as $h) {
            Holiday::firstOrCreate(['date' => $h['date']], $h);
        }
    }
}
