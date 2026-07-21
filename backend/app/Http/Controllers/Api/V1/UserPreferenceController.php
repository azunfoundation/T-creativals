<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserPreferenceController extends Controller
{
    /**
     * Get the authenticated user's workspace preferences.
     */
    public function show(Request $request): JsonResponse
    {
        $preferences = $request->user()->workspace_preferences ?? new \stdClass();

        return response()->json([
            'data' => $preferences,
        ]);
    }

    /**
     * Update the authenticated user's workspace preferences.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'preferences' => 'required|array',
        ]);

        $user = $request->user();
        
        // Merge or replace preferences safely
        $current = $user->workspace_preferences ?? [];
        $updated = array_replace_recursive($current, $validated['preferences']);

        $user->workspace_preferences = $updated;
        $user->save();

        return response()->json([
            'message' => 'Workspace preferences updated successfully',
            'data' => $user->workspace_preferences,
        ]);
    }
}
