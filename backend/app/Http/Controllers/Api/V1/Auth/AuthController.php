<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasswordResetMail;
use App\Models\LoginActivity;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Login and issue API token.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'       => ['required', 'email'],
            'password'    => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
        ]);

        $user = User::where('email', $request->email)
            ->where('is_client_portal_user', false)
            ->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            if ($user) {
                $this->logActivity($user->id, $request, 'failed');
            }

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'email' => ['Your account has been deactivated. Please contact your administrator.'],
            ]);
        }

        // Update last login
        $user->update([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ]);

        $this->logActivity($user->id, $request, 'success');

        $deviceName = $request->device_name ?? ($request->userAgent() ?? 'web');
        $token = $user->createToken($deviceName)->plainTextToken;

        return response()->json([
            'token'               => $token,
            'user'                => $this->formatUser($user),
            'message'             => 'Login successful.',
            'must_change_password' => (bool) $user->must_change_password,
        ]);
    }

    /**
     * Logout and revoke current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $this->logActivity($request->user()->id, $request, 'logout');
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    /**
     * Logout from all devices.
     */
    public function logoutAll(Request $request): JsonResponse
    {
        $this->logActivity($request->user()->id, $request, 'logout');
        $request->user()->tokens()->delete();

        return response()->json(['message' => 'Logged out from all devices.']);
    }

    /**
     * Get authenticated user with roles and permissions.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['departments', 'roles.permissions']);

        return response()->json([
            'data' => $this->formatUser($user),
        ]);
    }

    /**
     * Get login activity for current user.
     */
    public function loginActivity(Request $request): JsonResponse
    {
        $activities = $request->user()
            ->loginActivities()
            ->latest('logged_at')
            ->paginate(20);

        return response()->json($activities);
    }

    /**
     * Send password reset link email.
     * POST /api/v1/auth/forgot-password
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $request->email)
            ->where('is_client_portal_user', false)
            ->first();

        // Always return success for security (don't reveal if email exists)
        if ($user) {
            $token = Password::createToken($user);
            Mail::to($user->email)->send(new PasswordResetMail($user, $token));
        }

        return response()->json([
            'message' => 'If this email exists, you will receive a reset link shortly.',
        ]);
    }

    /**
     * Reset password using token.
     * POST /api/v1/auth/reset-password
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token'                 => ['required', 'string'],
            'email'                 => ['required', 'email'],
            'password'              => ['required', 'string', 'min:8', 'confirmed'],
            'password_confirmation' => ['required'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password'             => Hash::make($password),
                    'must_change_password' => false,
                ])->save();

                // Revoke all tokens after password reset
                $user->tokens()->delete();
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Password has been reset successfully.']);
        }

        return response()->json([
            'message' => __($status),
        ], 422);
    }

    /**
     * Change the authenticated user's password.
     * POST /api/v1/auth/change-password
     */
    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password'      => ['required', 'string'],
            'password'              => ['required', 'string', 'min:8', 'confirmed'],
            'password_confirmation' => ['required'],
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'errors'  => ['current_password' => ['The current password is incorrect.']],
            ], 422);
        }

        $user->forceFill([
            'password'             => Hash::make($request->password),
            'must_change_password' => false,
        ])->save();

        // Revoke all existing tokens and issue a fresh one
        $user->tokens()->delete();
        $deviceName = $request->userAgent() ?? 'web';
        $newToken = $user->createToken($deviceName)->plainTextToken;

        return response()->json([
            'message' => 'Password changed successfully.',
            'token'   => $newToken,
        ]);
    }

    // ─── Private Helpers ─────────────────────────────────────

    private function logActivity(?int $userId, Request $request, string $status): void
    {
        LoginActivity::create([
            'user_id'     => $userId,
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
            'device_type' => $this->detectDevice($request->userAgent()),
            'status'      => $status,
            'logged_at'   => now(),
        ]);
    }

    private function detectDevice(?string $userAgent): string
    {
        if (! $userAgent) return 'unknown';
        if (str_contains($userAgent, 'Mobile')) return 'mobile';
        if (str_contains($userAgent, 'Tablet')) return 'tablet';
        return 'desktop';
    }

    private function formatUser(User $user): array
    {
        return [
            'id'                  => $user->id,
            'name'                => $user->name,
            'email'               => $user->email,
            'phone'               => $user->phone,
            'employee_id'         => $user->employee_id,
            'avatar_url'          => $user->avatar_url,
            'status'              => $user->status,
            'must_change_password' => (bool) $user->must_change_password,
            'roles'               => $user->roles->map(fn($role) => [
                'id'           => $role->id,
                'name'         => $role->name,
                'display_name' => ucwords(str_replace('_', ' ', $role->name)),
            ]),
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'departments' => $user->departments->map(fn($d) => [
                'id'         => $d->id,
                'name'       => $d->name,
                'is_primary' => $d->pivot->is_primary,
            ]),
            'last_login_at' => $user->last_login_at,
            'created_at'    => $user->created_at,
        ];
    }
}
