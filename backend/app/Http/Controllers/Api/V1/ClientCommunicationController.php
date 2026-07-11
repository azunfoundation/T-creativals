<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClientCommunication;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClientCommunicationController extends Controller
{
    /**
     * List all communication logs for a client.
     * 
     * GET /api/v1/clients/{client}/communications
     */
    public function index(Request $request, User $client): JsonResponse
    {
        // Communication logs are internal CRM notes about the client — gate on
        // the Clients module permission. (Previously this controller had NO
        // authorization at all: any authenticated user, including client
        // portal accounts, could read every client's logs.)
        if (!$request->user()->hasPermissionTo('clients.view')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        // Confirm user has the client role
        if (!$client->hasRole('client')) {
            return response()->json(['message' => 'Specified user is not a client.'], 400);
        }

        $communications = $client->hasMany(ClientCommunication::class, 'client_id')
            ->with('recorder')
            ->orderBy('communication_date', 'desc')
            ->get();

        return response()->json([
            'data' => $communications
        ]);
    }

    /**
     * Store a new communication log for a client.
     * 
     * POST /api/v1/clients/{client}/communications
     */
    public function store(Request $request, User $client): JsonResponse
    {
        // Anyone who can view clients can log an interaction (sales execs
        // hold clients.view but not clients.edit).
        if (!$request->user()->hasPermissionTo('clients.view')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        // Confirm user has the client role
        if (!$client->hasRole('client')) {
            return response()->json(['message' => 'Specified user is not a client.'], 400);
        }

        $validated = $request->validate([
            'type'               => ['required', 'string', Rule::in(['email', 'call', 'meeting', 'other'])],
            'subject'            => ['required', 'string', 'max:255'],
            'content'            => ['nullable', 'string', 'max:5000'],
            'communication_date' => ['required', 'date'],
        ]);

        $validated['client_id'] = $client->id;
        $validated['recorded_by'] = $request->user()->id;

        $communication = ClientCommunication::create($validated);

        return response()->json([
            'message' => 'Communication log saved successfully.',
            'data' => $communication->load('recorder')
        ], 201);
    }

    /**
     * Delete a communication log.
     * 
     * DELETE /api/v1/clients/{client}/communications/{communication}
     */
    public function destroy(Request $request, User $client, ClientCommunication $communication): JsonResponse
    {
        // Deleting history is destructive: clients.edit, or the person who
        // recorded the log removing their own entry.
        $actor = $request->user();
        if (!$actor->hasPermissionTo('clients.edit') && $communication->recorded_by !== $actor->id) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($communication->client_id !== $client->id) {
            return response()->json(['message' => 'Communication log does not belong to this client.'], 400);
        }

        $communication->delete();

        return response()->json([
            'message' => 'Communication log deleted successfully.'
        ]);
    }
}
