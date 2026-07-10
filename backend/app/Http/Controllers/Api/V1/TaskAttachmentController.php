<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskAttachmentController extends Controller
{
    /**
     * List all attachments for a task.
     * 
     * GET /api/v1/tasks/{task}/attachments
     */
    public function index(Task $task): JsonResponse
    {
        $attachments = $task->attachments()->with('uploader')->orderBy('created_at', 'desc')->get();

        return response()->json([
            'data' => $attachments
        ]);
    }

    /**
     * Store a new task attachment record.
     * 
     * POST /api/v1/tasks/{task}/attachments
     */
    public function store(Request $request, Task $task): JsonResponse
    {
        $validated = $request->validate([
            'filename' => ['required', 'string', 'max:255'],
            // Must be a real path returned by POST /files/upload — confined to the
            // uploads tree with no traversal segments, so this endpoint can't be used
            // to attach (and later delete) an arbitrary file elsewhere on the public disk.
            'file_path' => ['required', 'string', 'max:500', 'regex:/^uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/'],
            'file_size' => ['nullable', 'integer'],
            'mime_type' => ['nullable', 'string', 'max:100'],
        ]);

        if (!Storage::disk('public')->exists($validated['file_path'])) {
            return response()->json(['message' => 'The referenced file does not exist.'], 422);
        }

        $validated['uploaded_by'] = $request->user()->id;

        $attachment = $task->attachments()->create($validated);

        return response()->json([
            'message' => 'Attachment saved successfully.',
            'data' => $attachment->load('uploader')
        ], 201);
    }

    /**
     * Delete a task attachment and remove its file from disk.
     * 
     * DELETE /api/v1/tasks/{task}/attachments/{attachment}
     */
    public function destroy(Task $task, TaskAttachment $attachment): JsonResponse
    {
        if ($attachment->task_id !== $task->id) {
            return response()->json(['message' => 'Attachment does not belong to this task.'], 400);
        }

        // Delete from storage disk
        if ($attachment->file_path && Storage::disk('public')->exists($attachment->file_path)) {
            Storage::disk('public')->delete($attachment->file_path);
        }

        $attachment->delete();

        return response()->json([
            'message' => 'Attachment deleted successfully.'
        ]);
    }
}
