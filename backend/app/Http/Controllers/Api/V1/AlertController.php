<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AlertController extends Controller
{
    /**
     * Display a listing of the unread alerts.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->integer('per_page', 15);
        
        $alerts = Alert::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->with('triggerer')
            ->latest()
            ->paginate($perPage);

        return response()->json([
            'data' => $alerts->items(),
            'meta' => [
                'current_page' => $alerts->currentPage(),
                'last_page' => $alerts->lastPage(),
                'per_page' => $alerts->perPage(),
                'total' => $alerts->total(),
            ],
        ]);
    }

    /**
     * Mark a single alert as read.
     */
    public function markRead(Request $request, int $id): JsonResponse
    {
        /** @var Alert $alert */
        $alert = Alert::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $alert->update([
            'is_read' => true,
            'read_at' => now(),
        ]);

        return response()->json([
            'message' => 'Alert marked as read.',
            'data' => $alert,
        ]);
    }

    /**
     * Mark all unread alerts as read.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        Alert::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'message' => 'All alerts marked as read.',
        ]);
    }
}
