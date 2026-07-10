<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Bonus;
use App\Models\Currency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class BonusController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (!Gate::allows('viewAny', Bonus::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $query = Bonus::with(['user', 'currency', 'approver'])->orderBy('effective_date', 'desc');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        return response()->json(['data' => $query->paginate($request->integer('per_page', 50))]);
    }

    public function store(Request $request): JsonResponse
    {
        if (!Gate::allows('create', Bonus::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'currency_id' => ['nullable', 'integer', 'exists:currencies,id'],
            'type' => ['required', 'in:performance,festival,referral'],
            'reason' => ['nullable', 'string'],
            'effective_date' => ['required', 'date'],
        ]);

        $validated['currency_id'] = $validated['currency_id']
            ?? (Currency::where('is_default', true)->value('id') ?? Currency::value('id'));
        $validated['status'] = 'pending';

        $bonus = Bonus::create($validated);

        return response()->json($bonus->load(['user', 'currency']), 201);
    }

    public function approve(Bonus $bonus): JsonResponse
    {
        if (!Gate::allows('approve', $bonus)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($bonus->status !== 'pending') {
            return response()->json(['message' => 'Only a pending bonus can be approved.'], 422);
        }

        $bonus->update(['status' => 'approved', 'approved_by' => request()->user()->id]);

        return response()->json($bonus->load(['user', 'currency', 'approver']));
    }

    public function reject(Bonus $bonus): JsonResponse
    {
        if (!Gate::allows('approve', $bonus)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($bonus->status !== 'pending') {
            return response()->json(['message' => 'Only a pending bonus can be rejected.'], 422);
        }

        $bonus->update(['status' => 'rejected', 'approved_by' => request()->user()->id]);

        return response()->json($bonus->load(['user', 'currency', 'approver']));
    }
}
