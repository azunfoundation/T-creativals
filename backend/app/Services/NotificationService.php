<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Alert;
use App\Models\NotificationPreference;

/**
 * Single source of truth for whether a user wants a notification on a given
 * channel. Email is opt-in (a saved preference row with email=true — same
 * default the existing task_assigned mail has always used); in-app alerts
 * are opt-out (on unless a saved row disables them).
 */
class NotificationService
{
    public static function emailEnabled(int $userId, string $event): bool
    {
        $pref = NotificationPreference::where('user_id', $userId)
            ->where('event_type', $event)
            ->first();

        return (bool) ($pref?->email);
    }

    public static function inAppEnabled(int $userId, string $event): bool
    {
        $pref = NotificationPreference::where('user_id', $userId)
            ->where('event_type', $event)
            ->first();

        return $pref === null || (bool) $pref->in_app;
    }

    /**
     * Create an in-app alert, honoring the recipient's in_app preference for
     * the given event. Attributes are the Alert::create payload.
     */
    public static function alert(string $event, array $attributes): void
    {
        $userId = $attributes['user_id'] ?? null;
        if (!$userId || !self::inAppEnabled((int) $userId, $event)) {
            return;
        }

        Alert::create($attributes);
    }
}
