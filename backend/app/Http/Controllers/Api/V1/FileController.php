<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FileController extends Controller
{
    /**
     * Upload a file and return its public URL and metadata.
     * 
     * POST /api/v1/files/upload
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file'],
            'type' => ['nullable', 'string', 'in:avatar,logo,receipt,attachment'],
        ]);

        $file = $request->file('file');
        $type = $request->input('type', 'attachment');

        // Dynamic validation based on type
        $rules = [];
        switch ($type) {
            case 'avatar':
            case 'logo':
                $rules = ['file' => 'image|mimes:jpeg,png,jpg,webp,gif|max:2048'];
                break;
            case 'receipt':
                $rules = ['file' => 'file|mimes:jpeg,png,jpg,pdf|max:5120'];
                break;
            case 'attachment':
            default:
                $rules = ['file' => 'file|mimes:jpeg,png,jpg,pdf,zip,rar,csv,xlsx,xls,docx,doc,txt|max:10240'];
                break;
        }

        $validator = \Illuminate\Support\Facades\Validator::make(['file' => $file], $rules);
        if ($validator->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors(),
            ], 422);
        }

        // Store file in public disk
        $folder = 'uploads/' . Str::plural($type);
        $path = $file->store($folder, 'public');

        $url = Storage::disk('public')->url($path);

        return response()->json([
            'message' => 'File uploaded successfully.',
            'data' => [
                'filename' => $file->getClientOriginalName(),
                'file_path' => $path,
                'url' => $url,
                'mime_type' => $file->getClientMimeType(),
                'file_size' => $file->getSize(),
            ]
        ], 201);
    }
}
