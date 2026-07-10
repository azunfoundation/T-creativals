<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditLogController extends Controller
{
    /**
     * Display a paginated list of audit logs with advanced filtering.
     * GET /api/v1/audit-logs
     */
    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('audit.view')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $query = AuditLog::query()
            ->with('user:id,name,email')
            ->orderByDesc('created_at');

        // Filter by user
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        // Filter by event type
        if ($request->filled('event')) {
            $query->where('event', $request->string('event'));
        }

        // Filter by module / auditable type
        if ($request->filled('auditable_type')) {
            $type = $request->string('auditable_type');
            if (!str_contains((string) $type, '\\')) {
                $type = 'App\\Models\\' . basename((string) $type);
            }
            $query->where('auditable_type', $type);
        }

        // Filter by date range
        if ($request->filled('from')) {
            $query->where('created_at', '>=', Carbon::parse($request->input('from'))->startOfDay());
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', Carbon::parse($request->input('to'))->endOfDay());
        }

        // Search in IP address, user agent, or change parameters
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where(function ($q) use ($search) {
                $q->where('ip_address', 'like', "%{$search}%")
                  ->orWhere('user_agent', 'like', "%{$search}%")
                  ->orWhere('old_values', 'like', "%{$search}%")
                  ->orWhere('new_values', 'like', "%{$search}%")
                  ->orWhere('metadata', 'like', "%{$search}%");
            });
        }

        // Export to CSV directly
        if ($request->input('export') === 'csv') {
            return $this->exportCsv($query->get());
        }

        $logs = $query->paginate($request->integer('per_page', 20));

        // Format short type labels for UI ease
        $formattedLogs = collect($logs->items())->map(function ($log) {
            $log->short_type = class_basename($log->auditable_type);
            return $log;
        });

        return response()->json([
            'data' => $formattedLogs,
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
            'message' => 'Audit logs retrieved successfully.',
        ]);
    }

    /**
     * Helper to stream CSV response of audit logs.
     */
    protected function exportCsv($logs): StreamedResponse
    {
        $callback = function () use ($logs) {
            $file = fopen('php://output', 'w');
            
            // Header columns
            fputcsv($file, [
                'Log ID', 'User ID', 'User Name', 'User Email', 'Event',
                'Model Class', 'Model Name', 'Record ID', 'IP Address', 'User Agent', 'Created At'
            ]);

            foreach ($logs as $log) {
                fputcsv($file, [
                    $log->id,
                    $log->user_id,
                    $log->user?->name ?: 'System',
                    $log->user?->email ?: 'system@creativals.com',
                    $log->event,
                    $log->auditable_type,
                    class_basename($log->auditable_type),
                    $log->auditable_id,
                    $log->ip_address,
                    $log->user_agent,
                    $log->created_at->toIso8601String(),
                ]);
            }

            fclose($file);
        };

        // Create log entry for audit log export!
        try {
            AuditLog::create([
                'user_id'        => auth()->id(),
                'auditable_type' => AuditLog::class,
                'auditable_id'   => 0,
                'event'          => 'exported',
                'ip_address'     => request()->ip(),
                'user_agent'     => request()->userAgent(),
                'metadata'       => ['type' => 'csv_audit_export'],
            ]);
        } catch (\Exception $e) {
            // Silently ignore to avoid breaking the download
        }

        return response()->stream($callback, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="audit_logs_report.csv"',
        ]);
    }
}
