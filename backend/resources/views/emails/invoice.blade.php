<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Invoice from Creativals Studio</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Invoice Available</h2>
    <p>Hello {{ $invoice->client?->name ?? 'Client' }},</p>
    <p>A new invoice has been generated for your account. Please find the details below:</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Invoice Number:</strong> {{ $invoice->invoice_number }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Title:</strong> {{ $invoice->title }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Total Amount:</strong> {{ $invoice->currency?->symbol ?? '₹' }}{{ number_format($invoice->total_amount, 2) }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Due Date:</strong> {{ $invoice->due_date?->format('d/m/Y') ?? 'N/A' }}</p>
      <p style="margin: 0;"><strong>Status:</strong> {{ ucfirst($invoice->status) }}</p>
    </div>
    <p>You can view and pay this invoice online by clicking the link below:</p>
    <a href="{{ $portalUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      View Invoice
    </a>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">Creativals Studio &bull; No 45, Residency Road, Bangalore - 560025</p>
  </div>
</body>
</html>
