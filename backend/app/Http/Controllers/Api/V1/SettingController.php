<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CompanySetting;
use App\Models\Currency;
use App\Models\NumberSequence;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettingController extends Controller
{
    /**
     * Get all general settings, currencies, and number sequences.
     * GET /api/v1/settings
     * Any authenticated user may read settings (needed for currency/tax display).
     */
    public function index(): JsonResponse
    {
        $settings        = CompanySetting::all()->pluck('value', 'key');
        $currencies      = Currency::all();
        $numberSequences = NumberSequence::all();

        return response()->json([
            'data' => [
                'company' => [
                    'company_name'    => $settings->get('company_name', 'Creativals Digital Marketing Agency'),
                    'company_email'   => $settings->get('company_email', 'hello@creativals.com'),
                    'company_phone'   => $settings->get('company_phone', '+91 98765 43210'),
                    'company_address' => $settings->get('company_address', 'Mumbai, Maharashtra, India'),
                    'timezone'        => $settings->get('timezone', 'Asia/Kolkata'),
                    'logo_url'        => $settings->get('logo_url', null),
                    'date_format'     => $settings->get('date_format', 'DD/MM/YYYY'),
                    'smtp_host'       => $settings->get('smtp_host', null),
                    'smtp_port'       => $settings->get('smtp_port', '587'),
                    'smtp_username'   => $settings->get('smtp_username', null),
                    'smtp_from_name'  => $settings->get('smtp_from_name', null),
                    'smtp_from_email' => $settings->get('smtp_from_email', null),
                    // Never return smtp_password
                ],
                'tax' => [
                    'default_tax_rate' => $settings->get('default_tax_rate', '18'),
                ],
                'currencies'       => $currencies,
                'number_sequences' => $numberSequences,
            ],
            'message' => 'Settings retrieved successfully.',
        ]);
    }

    /**
     * Update company profile information.
     * PUT /api/v1/settings/company
     * Only founder or director may update company settings.
     */
    public function updateCompany(Request $request): JsonResponse
    {
        $this->authorizeSettings($request);

        $validated = $request->validate([
            'company_name'    => ['required', 'string', 'max:255'],
            'company_email'   => ['required', 'email', 'max:255'],
            'company_phone'   => ['required', 'string', 'max:50'],
            'company_address' => ['required', 'string', 'max:1000'],
            'timezone'        => ['required', 'string', 'max:100'],
            'logo_url'        => ['nullable', 'string', 'max:2048'],
            'date_format'     => ['nullable', 'string', 'max:30'],
        ]);

        foreach ($validated as $key => $val) {
            CompanySetting::setValue($key, (string) $val, 'general');
        }

        return response()->json(['message' => 'Company profile updated successfully.']);
    }

    /**
     * Update SMTP mail settings.
     * PUT /api/v1/settings/smtp
     * Only founder or director may update SMTP settings.
     */
    public function updateSmtp(Request $request): JsonResponse
    {
        $this->authorizeSettings($request);

        $validated = $request->validate([
            'smtp_host'       => ['required', 'string', 'max:255'],
            'smtp_port'       => ['required', 'integer', 'min:1', 'max:65535'],
            'smtp_username'   => ['required', 'string', 'max:255'],
            'smtp_password'   => ['nullable', 'string', 'max:255'],
            'smtp_from_name'  => ['required', 'string', 'max:255'],
            'smtp_from_email' => ['required', 'email', 'max:255'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl,starttls'],
        ]);

        foreach (['smtp_host', 'smtp_port', 'smtp_username', 'smtp_from_name', 'smtp_from_email', 'smtp_encryption'] as $key) {
            if (isset($validated[$key])) {
                CompanySetting::setValue($key, (string) $validated[$key], 'smtp');
            }
        }

        // Only update password if provided (prevent blank override)
        if (!empty($validated['smtp_password'])) {
            CompanySetting::setValue('smtp_password', $validated['smtp_password'], 'smtp');
        }

        return response()->json(['message' => 'SMTP settings updated successfully.']);
    }

    /**
     * Send a test email to verify the SMTP configuration actually works.
     * POST /api/v1/settings/smtp/test
     * Only founder or director may trigger it.
     */
    public function sendTestEmail(Request $request): JsonResponse
    {
        $this->authorizeSettings($request);

        $validated = $request->validate([
            'to' => ['nullable', 'email'],
        ]);

        $to = $validated['to'] ?? $request->user()->email;

        // Apply freshest DB SMTP settings for this request (mirrors the boot logic,
        // so a just-saved config is tested without any restart).
        $settings = CompanySetting::where('group', 'smtp')->pluck('value', 'key');
        if ($settings->has('smtp_host')) {
            config([
                'mail.default'                 => 'smtp',
                'mail.mailers.smtp.host'       => $settings->get('smtp_host'),
                'mail.mailers.smtp.port'       => (int) $settings->get('smtp_port', 587),
                'mail.mailers.smtp.username'   => $settings->get('smtp_username'),
                'mail.mailers.smtp.password'   => $settings->get('smtp_password'),
                'mail.mailers.smtp.encryption' => $settings->get('smtp_encryption', 'tls'),
                'mail.from.address'            => $settings->get('smtp_from_email'),
                'mail.from.name'               => $settings->get('smtp_from_name'),
            ]);
        }

        $mailer = config('mail.default');
        $host   = config("mail.mailers.{$mailer}.host", 'n/a');

        try {
            \Illuminate\Support\Facades\Mail::mailer($mailer)->raw(
                "This is a test email from Creativals OS.\n\n"
                . "If you are reading this, your SMTP configuration works.\n"
                . 'Mailer: ' . $mailer . "\n"
                . 'Host: ' . $host . "\n"
                . 'Sent at: ' . now()->toDateTimeString(),
                function ($message) use ($to) {
                    $message->to($to)->subject('Creativals OS — SMTP Test Email');
                }
            );

            return response()->json([
                'message' => "Test email sent to {$to} via '{$mailer}'. Check the inbox (and spam folder).",
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('SMTP test email failed: ' . $e->getMessage());

            return response()->json([
                'message' => 'Test email failed: ' . $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Update tax defaults settings.
     * PUT /api/v1/settings/tax
     * Only founder or director may update tax settings.
     */
    public function updateTax(Request $request): JsonResponse
    {
        $this->authorizeSettings($request);

        $validated = $request->validate([
            'default_tax_rate' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);

        CompanySetting::setValue('default_tax_rate', (string) $validated['default_tax_rate'], 'tax');

        return response()->json(['message' => 'Tax settings updated successfully.']);
    }

    /**
     * Update number sequence templates.
     * PUT /api/v1/settings/number-sequences
     * Only founder or director may update number sequences.
     */
    public function updateNumberSequences(Request $request): JsonResponse
    {
        $this->authorizeSettings($request);

        $validated = $request->validate([
            'sequences'                    => ['required', 'array'],
            'sequences.*.entity_type'      => ['required', 'string'],
            'sequences.*.prefix'           => ['required', 'string', 'max:20'],
            'sequences.*.current_number'   => ['required', 'integer', 'min:0'],
            'sequences.*.padding_length'   => ['required', 'integer', 'min:1', 'max:10'],
            'sequences.*.format'           => ['required', 'string', 'max:50'],
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['sequences'] as $seqData) {
                NumberSequence::updateOrCreate(
                    ['entity_type' => $seqData['entity_type']],
                    [
                        'prefix'         => $seqData['prefix'],
                        'current_number' => $seqData['current_number'],
                        'padding_length' => $seqData['padding_length'],
                        'format'         => $seqData['format'],
                    ]
                );
            }
        });

        return response()->json(['message' => 'Number sequences updated successfully.']);
    }

    /**
     * Update currencies active status and default selection.
     * PUT /api/v1/settings/currencies
     * Only founder or director may update currency settings.
     */
    public function updateCurrencies(Request $request): JsonResponse
    {
        $this->authorizeSettings($request);

        $validated = $request->validate([
            'default_currency_code'    => ['required', 'string', 'exists:currencies,code'],
            'active_currency_codes'    => ['required', 'array'],
            'active_currency_codes.*'  => ['required', 'string', 'exists:currencies,code'],
        ]);

        $defaultCode = $validated['default_currency_code'];
        $activeCodes = $validated['active_currency_codes'];

        // Enforce that default currency must be in the active array
        if (!in_array($defaultCode, $activeCodes, true)) {
            $activeCodes[] = $defaultCode;
        }

        DB::transaction(function () use ($defaultCode, $activeCodes) {
            Currency::query()->update(['is_active' => false, 'is_default' => false]);
            Currency::whereIn('code', $activeCodes)->update(['is_active' => true]);
            Currency::where('code', $defaultCode)->update(['is_default' => true]);
            CompanySetting::setValue('default_currency', $defaultCode, 'currency');
        });

        return response()->json(['message' => 'Currency settings updated successfully.']);
    }

    // ─── Private Helpers ─────────────────────────────────────────

    /**
     * Only founders and directors may modify platform settings.
     */
    private function authorizeSettings(Request $request): void
    {
        $user = $request->user();

        if (!$user || !$user->hasAnyRole(['founder', 'director'])) {
            abort(403, 'Only founders and directors may modify platform settings.');
        }
    }
}
