<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Lightweight reachability probe used by the frontend login page and the
 * local startup script. Deliberately touches no database or session state.
 * Kept as a controller (not a route closure) so `route:cache` works in prod.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'time'   => now()->toIso8601String(),
        ]);
    }
}
