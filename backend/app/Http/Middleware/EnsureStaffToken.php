<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks client-portal sessions from the staff API.
 *
 * Portal logins issue Sanctum tokens scoped to ['portal:read'] while staff
 * logins issue ['*'] — but token abilities were never checked anywhere, so a
 * portal token could call every staff endpoint (scoped only by whatever each
 * policy happened to allow the `client` role). Staff tokens (['*']) and test
 * TransientTokens pass tokenCan() for anything; portal tokens fail for
 * everything except portal:read.
 */
class EnsureStaffToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        // Only gate real bearer tokens: staff tokens carry ['*'] (can()
        // passes anything) and portal tokens ['portal:read'] (fails). Test
        // logins via actingAs() have no access token at all — allow those.
        $token = $user?->currentAccessToken();
        if ($token && !$token->can('staff-api')) {
            return response()->json([
                'message' => 'This endpoint is not available to client portal sessions.',
            ], 403);
        }

        return $next($request);
    }
}
