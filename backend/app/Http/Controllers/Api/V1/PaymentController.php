<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class PaymentController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse|AnonymousResourceCollection
    {
        $user = $request->user();

        if (!Gate::allows('viewAny', Payment::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if (!$user->isFounder() && !$user->hasPermissionTo('invoices.view_all')) {
            if ($user->hasRole('client') || $user->is_client_portal_user) {
                // Client sees only payments for their own invoices
                $query = Payment::whereHas('invoice', function ($q) use ($user) {
                    $q->where('client_id', $user->id);
                });
            } elseif ($user->hasPermissionTo('invoices.view')) {
                // User sees only payments recorded by themselves
                $query = Payment::where('recorded_by', $user->id);
            } else {
                return response()->json(['message' => 'This action is unauthorized.'], 403);
            }
        } else {
            $query = Payment::query();
        }

        // Apply filters
        if ($request->has('invoice_id')) {
            $query->where('invoice_id', $request->input('invoice_id'));
        }

        if ($request->has('payment_method')) {
            $query->where('payment_method', $request->input('payment_method'));
        }

        $payments = $query->with(['invoice', 'recorder'])
            ->orderBy('payment_date', 'desc')
            ->paginate($request->integer('per_page', 15));

        return PaymentResource::collection($payments);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Payment $payment): JsonResponse|PaymentResource
    {
        if (!Gate::allows('view', $payment)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return new PaymentResource($payment->load(['invoice', 'recorder']));
    }

    /**
     * Remove the specified payment from storage.
     */
    public function destroy(Request $request, Payment $payment): JsonResponse
    {
        if (!Gate::allows('delete', $payment)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $payment->delete(); // This triggers the deleted event which recalculates the Invoice due_amount & status!

        return response()->json([
            'message' => 'Payment deleted successfully.',
        ]);
    }
}
