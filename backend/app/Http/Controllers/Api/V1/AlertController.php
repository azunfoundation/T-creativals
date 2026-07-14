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
     * Display a listing of alerts.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->integer('per_page', 50);
        $filter = $request->str('filter', 'all')->toString();
        $search = $request->str('search', '')->toString();

        $query = Alert::where('user_id', $request->user()->id)
            ->with('triggerer')
            ->latest();

        // Apply filters
        if ($filter === 'unread') {
            $query->where('is_read', false);
        } elseif ($filter === 'mentions') {
            $query->where('type', 'mention');
        } elseif ($filter === 'tasks') {
            $query->where(function ($q) {
                $q->where('type', 'like', 'task_%')
                  ->orWhere('type', 'task');
            });
        } elseif ($filter === 'projects') {
            $query->where('type', 'like', 'project_%');
        } elseif ($filter === 'crm') {
            $query->where(function ($q) {
                $q->where('type', 'like', 'lead_%')
                  ->orWhere('type', 'like', 'crm_%');
            });
        } elseif ($filter === 'invoices') {
            $query->where(function ($q) {
                $q->where('type', 'like', 'invoice_%')
                  ->orWhere('type', 'payment_received');
            });
        } elseif ($filter === 'quotes') {
            $query->where('type', 'like', 'quote_%');
        } elseif ($filter === 'approvals') {
            $query->where(function ($q) {
                $q->where('type', 'like', '%_approval_%')
                  ->orWhere('type', 'like', '%_approved')
                  ->orWhere('type', 'like', '%_rejected')
                  ->orWhere('type', 'approval_requested')
                  ->orWhere('type', 'approval_actioned');
            });
        } elseif ($filter === 'system') {
            $query->where('type', 'system');
        }

        // Apply search if present
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('body', 'like', "%{$search}%");
            });
        }

        $alerts = $query->paginate($perPage);

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

    /**
     * Delete a single alert.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        /** @var Alert $alert */
        $alert = Alert::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $alert->delete();

        return response()->json([
            'message' => 'Alert deleted successfully.',
        ]);
    }

    /**
     * Delete all read alerts.
     */
    public function destroyRead(Request $request): JsonResponse
    {
        Alert::where('user_id', $request->user()->id)
            ->where('is_read', true)
            ->delete();

        return response()->json([
            'message' => 'All read alerts deleted.',
        ]);
    }
}
