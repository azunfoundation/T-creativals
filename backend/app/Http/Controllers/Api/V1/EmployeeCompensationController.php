<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CompensationType;
use App\Models\EmployeeCompensation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class EmployeeCompensationController extends Controller
{
    /**
     * List compensation records. Defaults to the current record per employee;
     * pass ?user_id= to see that employee's full effective-dated history.
     */
    public function index(Request $request): JsonResponse
    {
        if (!Gate::allows('viewAny', EmployeeCompensation::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $query = EmployeeCompensation::with(['user', 'compensationType', 'currency'])
            ->orderBy('effective_from', 'desc');

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        } else {
            $query->where('is_current', true);
        }

        return response()->json(['data' => $query->get()]);
    }

    /**
     * Create a new effective-dated compensation record for an employee.
     * Closes out (is_current=false) whatever record was previously current
     * for that employee, mirroring how the rest of the schema tracks history.
     */
    public function store(Request $request): JsonResponse
    {
        if (!Gate::allows('create', EmployeeCompensation::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'compensation_type_id' => ['required', 'integer', 'exists:compensation_types,id'],
            'base_amount' => ['required', 'numeric', 'min:0'],
            'currency_id' => ['required', 'integer', 'exists:currencies,id'],
            'expected_monthly_hours' => ['nullable', 'numeric', 'min:0'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0'],
            'tds_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'pf_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'esi_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'effective_from' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $compensation = DB::transaction(function () use ($validated) {
            EmployeeCompensation::where('user_id', $validated['user_id'])
                ->where('is_current', true)
                ->update([
                    'is_current' => false,
                    'effective_until' => $validated['effective_from'],
                ]);

            return EmployeeCompensation::create([
                ...$validated,
                'expected_monthly_hours' => $validated['expected_monthly_hours'] ?? 0,
                'hourly_rate' => $validated['hourly_rate'] ?? 0,
                'is_current' => true,
            ]);
        });

        return response()->json($compensation->load(['user', 'compensationType', 'currency']), 201);
    }

    /**
     * Correct a compensation record in place (e.g. a data-entry mistake) without
     * versioning a new row. Does not change which record is "current".
     */
    public function update(Request $request, EmployeeCompensation $employeeCompensation): JsonResponse
    {
        if (!Gate::allows('update', $employeeCompensation)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'compensation_type_id' => ['sometimes', 'integer', 'exists:compensation_types,id'],
            'base_amount' => ['sometimes', 'numeric', 'min:0'],
            'currency_id' => ['sometimes', 'integer', 'exists:currencies,id'],
            'expected_monthly_hours' => ['sometimes', 'numeric', 'min:0'],
            'hourly_rate' => ['sometimes', 'numeric', 'min:0'],
            'tds_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'pf_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'esi_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'effective_from' => ['sometimes', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $employeeCompensation->update($validated);

        return response()->json($employeeCompensation->load(['user', 'compensationType', 'currency']));
    }

    /**
     * Read-only list of compensation types (fixed/hourly/hybrid) for the Salary Setup form.
     */
    public function types(): JsonResponse
    {
        return response()->json(['data' => CompensationType::orderBy('name')->get()]);
    }
}
