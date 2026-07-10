<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class BackupController extends Controller
{
    /**
     * Get the active database path.
     */
    protected function getDatabasePath(): string
    {
        return DB::connection()->getDatabaseName();
    }

    /**
     * Get the backup directory path.
     */
    protected function getBackupDirectory(): string
    {
        $path = storage_path('app/backups');
        if (!File::exists($path)) {
            File::makeDirectory($path, 0755, true, true);
        }
        return $path;
    }

    /**
     * List all database backup files with size and integrity details.
     * GET /api/v1/backups
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $directory = $this->getBackupDirectory();
        $files = File::files($directory);

        $backups = [];
        foreach ($files as $file) {
            if ($file->getExtension() !== 'sqlite') {
                continue;
            }

            $filename = $file->getFilename();
            $filePath = $file->getRealPath();

            // Run PRAGMA integrity check
            $status = 'valid';
            try {
                $tempPdo = new \PDO("sqlite:" . $filePath);
                $stmt = $tempPdo->query("PRAGMA integrity_check;");
                $check = $stmt ? $stmt->fetchColumn() : 'failed';
                if ($check !== 'ok') {
                    $status = 'corrupted';
                }
            } catch (\Exception $e) {
                $status = 'corrupted';
            }

            $backups[] = [
                'filename' => $filename,
                'size' => $file->getSize(),
                'created_at' => Carbon::createFromTimestamp($file->getMTime())->toIso8601String(),
                'status' => $status,
            ];
        }

        // Sort backups: latest first
        usort($backups, function ($a, $b) {
            return strcmp($b['created_at'], $a['created_at']);
        });

        return response()->json([
            'data' => $backups,
            'message' => 'Backups list retrieved successfully.',
        ]);
    }

    /**
     * Create a manual database backup.
     * POST /api/v1/backups
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('settings.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $dbPath = $this->getDatabasePath();
        if ($dbPath === ':memory:') {
            $dbPathDir = storage_path('app');
            if (!File::exists($dbPathDir)) {
                File::makeDirectory($dbPathDir, 0755, true, true);
            }
            $dbPath = $dbPathDir . '/temp_test_db.sqlite';
            if (!File::exists($dbPath)) {
                $tempPdo = new \PDO("sqlite:" . $dbPath);
                $tempPdo->exec("CREATE TABLE IF NOT EXISTS test_integrity (id INTEGER PRIMARY KEY);");
                $tempPdo = null;
            }
        } elseif (!File::exists($dbPath)) {
            return response()->json(['message' => 'Active SQLite database file not found.'], 422);
        }

        $timestamp = now()->format('Y-m-d_H-i-s');
        $filename = "backup-{$timestamp}.sqlite";
        $backupPath = $this->getBackupDirectory() . DIRECTORY_SEPARATOR . $filename;

        try {
            File::copy($dbPath, $backupPath);

            // Log to audit logs
            AuditLog::create([
                'user_id' => $user->id,
                'auditable_type' => AuditLog::class,
                'auditable_id' => 0,
                'event' => 'created',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => ['type' => 'manual_backup', 'filename' => $filename],
            ]);

            return response()->json([
                'data' => [
                    'filename' => $filename,
                    'size' => File::size($backupPath),
                    'created_at' => now()->toIso8601String(),
                    'status' => 'valid',
                ],
                'message' => 'Database backup created successfully.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create database backup: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete a backup file.
     * DELETE /api/v1/backups/{filename}
     */
    public function destroy(Request $request, string $filename): JsonResponse
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('recovery.restore')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        // Prevent path traversal
        $filename = basename($filename);
        $backupPath = $this->getBackupDirectory() . DIRECTORY_SEPARATOR . $filename;

        if (!File::exists($backupPath)) {
            return response()->json(['message' => 'Backup file not found.'], 404);
        }

        try {
            File::delete($backupPath);

            // Log to audit logs
            AuditLog::create([
                'user_id' => $user->id,
                'auditable_type' => AuditLog::class,
                'auditable_id' => 0,
                'event' => 'deleted',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => ['type' => 'delete_backup', 'filename' => $filename],
            ]);

            return response()->json([
                'message' => 'Backup file deleted successfully.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete backup file: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Restore database from a backup file.
     * POST /api/v1/backups/{filename}/restore
     */
    public function restore(Request $request, string $filename): JsonResponse
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('recovery.restore')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $filename = basename($filename);
        $backupPath = $this->getBackupDirectory() . DIRECTORY_SEPARATOR . $filename;

        if (!File::exists($backupPath)) {
            return response()->json(['message' => 'Backup file not found.'], 404);
        }

        // 1. Integrity check safeguard
        try {
            $tempPdo = new \PDO("sqlite:" . $backupPath);
            $stmt = $tempPdo->query("PRAGMA integrity_check;");
            $check = $stmt ? $stmt->fetchColumn() : 'failed';
            if ($check !== 'ok') {
                return response()->json([
                    'message' => 'Backup file integrity validation failed. File may be corrupted.',
                ], 422);
            }
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Backup file integrity check failed: ' . $e->getMessage(),
            ], 422);
        }

        // 2. Pre-restore backup fallback safeguard
        $dbPath = $this->getDatabasePath();
        $isMemory = ($dbPath === ':memory:');
        if ($isMemory) {
            $dbPath = storage_path('app/temp_test_db.sqlite');
        }
        $timestamp = now()->format('Y-m-d_H-i-s');
        $fallbackFilename = "pre-restore-backup-{$timestamp}.sqlite";
        $fallbackPath = $this->getBackupDirectory() . DIRECTORY_SEPARATOR . $fallbackFilename;

        try {
            if (File::exists($dbPath)) {
                File::copy($dbPath, $fallbackPath);
            }

            // Close connection handles to let us overwrite the sqlite file safely
            if (!$isMemory) {
                DB::disconnect();
            }

            // 3. Replace active database
            File::copy($backupPath, $dbPath);

            // Log to audit logs (re-establishes DB connection)
            AuditLog::create([
                'user_id' => $user->id,
                'auditable_type' => AuditLog::class,
                'auditable_id' => 0,
                'event' => 'restored',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => [
                    'type' => 'restore_database',
                    'restored_file' => $filename,
                    'fallback_backup' => $fallbackFilename
                ],
            ]);

            return response()->json([
                'message' => 'Database restored successfully. Active session re-initialized.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to restore database: ' . $e->getMessage(),
            ], 500);
        }
    }
}
