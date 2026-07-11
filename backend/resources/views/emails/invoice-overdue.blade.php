<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice Overdue</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #ef4444; margin-top: 0;">Invoice Overdue</h2>
    <p>An invoice you issued has passed its due date without full payment:</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Invoice:</strong> {{ $invoice->invoice_number }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Client:</strong> {{ $invoice->client?->name ?? 'N/A' }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Due Date:</strong> {{ \Illuminate\Support\Carbon::parse($invoice->due_date)->format('d/m/Y') }}</p>
      <p style="margin: 0;"><strong>Balance Due:</strong> {{ number_format((float) $invoice->due_amount, 2) }}</p>
    </div>
    <p>Consider following up with the client for payment:</p>
    <a href="{{ $invoiceUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      Open Invoice
    </a>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">This is an automated notification from Creativals OS. You can turn these emails off under Settings → Notifications.</p>
  </div>
</body>
</html>
