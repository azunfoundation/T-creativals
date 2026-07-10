<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\MilestoneResource;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\TaskResource;
use App\Models\Invoice;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class PortalController extends Controller
{
    // ─── Authentication ───────────────────────────────────────────────────────

    /**
     * Client-portal login.
     *
     * Validates email + password, confirms the user has the 'client' Spatie role,
     * then issues a scoped Sanctum personal access token.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        /** @var User|null $user */
        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if (!$user->hasRole('client')) {
            return response()->json(['message' => 'Access denied. This portal is for clients only.'], 403);
        }

        if (!$user->is_client_portal_user) {
            return response()->json(['message' => 'Access denied. Portal access has been disabled for your account.'], 403);
        }

        // Revoke any pre-existing portal tokens to enforce single-session behaviour.
        $user->tokens()->where('name', 'client-portal')->delete();

        $token = $user->createToken('client-portal', ['portal:read']);

        return response()->json([
            'token' => $token->plainTextToken,
            'user'  => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
            ],
        ]);
    }

    // ─── Projects ─────────────────────────────────────────────────────────────

    /**
     * List all projects belonging to the authenticated client.
     */
    public function projects(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertIsPortalClient($user);

        $projects = Project::with(['members.user', 'milestones'])
            ->where('client_id', $user->id)
            ->withCount(['milestones', 'tasks'])
            ->paginate((int) $request->input('per_page', 15));

        return ProjectResource::collection($projects)->response();
    }

    /**
     * Show a specific project owned by the authenticated client.
     */
    public function projectShow(Request $request, Project $project): JsonResponse
    {
        $this->assertIsPortalClient($request->user());
        $this->enforceClientOwnership($request->user(), $project);

        $project->load(['members.user', 'members.department', 'milestones', 'manager']);
        $project->loadCount(['milestones', 'tasks']);

        return (new ProjectResource($project))->additional([
            'milestones' => MilestoneResource::collection($project->milestones),
        ])->response();
    }

    /**
     * List read-only tasks for a project owned by the authenticated client.
     */
    public function projectTasks(Request $request, Project $project): JsonResponse
    {
        $this->assertIsPortalClient($request->user());
        $this->enforceClientOwnership($request->user(), $project);

        $tasks = $project->tasks()
            ->with(['assignee', 'milestone'])
            ->withCount('comments')
            ->orderBy('sort_order')
            ->get();

        return TaskResource::collection($tasks)->response();
    }

    // ─── Invoices ─────────────────────────────────────────────────────────────

    /**
     * List all invoices belonging to the authenticated client.
     */
    public function invoices(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertIsPortalClient($user);

        $invoices = Invoice::with(['currency', 'payments'])
            ->where('client_id', $user->id)
            ->latest('issue_date')
            ->paginate((int) $request->input('per_page', 15));

        return InvoiceResource::collection($invoices)->response();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Abort with 403 if the given project does not belong to the authenticated user.
     */
    private function enforceClientOwnership(User $user, Project $project): void
    {
        if ((int) $project->client_id !== (int) $user->id) {
            abort(403, 'Access denied. This project does not belong to your account.');
        }
    }

    /**
     * These routes are documented (routes/api.php) as "client role enforced
     * inside controller" but only login() ever actually checked that — the
     * data endpoints relied solely on ownership scoping. Ownership scoping
     * alone still prevented any real cross-tenant leak (a non-client's id
     * never matches a project/invoice's client_id), but any authenticated
     * staff token could legally hit these "portal" routes. Enforce the same
     * check login() already makes so the route comment is actually true.
     */
    private function assertIsPortalClient(User $user): void
    {
        if (!$user->hasRole('client') || !$user->is_client_portal_user) {
            abort(403, 'Access denied. This portal is for clients only.');
        }
    }
}
