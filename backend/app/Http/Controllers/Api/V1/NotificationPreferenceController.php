<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    /**
     * Get the authenticated user's notification preferences.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $preferences = NotificationPreference::where('user_id', $user->id)->get();

        return response()->json([
            'data' => $preferences,
        ]);
    }

    /**
     * Update the authenticated user's notification preferences.
     */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        // Note: 'in_app' and 'push' are stored but never consulted anywhere — every
        // in-app alert fires unconditionally (see e.g. LeadObserver) and no push
        // notification transport exists in this app. Only 'email' actually gates
        // anything (TaskController, TimesheetController, PayrollRunController), so
        // the frontend only collects/sends that. Both are left optional (rather than
        // required) so old and new clients can both post a preference payload.
        $validated = $request->validate([
            'preferences' => ['required', 'array'],
            'preferences.*.event_type' => ['required', 'string'],
            'preferences.*.in_app' => ['sometimes', 'boolean'],
            'preferences.*.email' => ['required', 'boolean'],
            'preferences.*.push' => ['sometimes', 'boolean'],
        ]);

        foreach ($validated['preferences'] as $pref) {
            NotificationPreference::updateOrCreate(
                [
                    'user_id' => $user->id,
                    'event_type' => $pref['event_type'],
                ],
                [
                    'in_app' => $pref['in_app'] ?? true,
                    'email'  => $pref['email'],
                    'push'   => $pref['push'] ?? false,
                ]
            );
        }

        return response()->json([
            'message' => 'Notification preferences updated successfully.',
            'data' => NotificationPreference::where('user_id', $user->id)->get(),
        ]);
    }
}
