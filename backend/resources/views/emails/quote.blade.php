<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Quote Proposal from Creativals Studio</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Quote Proposal Ready</h2>
    <p>Hello {{ $quote->lead?->company_name ?? 'Client' }},</p>
    <p>A new quotation has been prepared for your review. Please see the summary below:</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Proposal ID:</strong> {{ $quote->quote_number }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Title:</strong> {{ $quote->title }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Proposed Investment:</strong> {{ $quote->currency?->symbol ?? '₹' }}{{ number_format($quote->total_amount, 2) }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Valid Until:</strong> {{ $quote->valid_until?->format('d/m/Y') ?? 'N/A' }}</p>
    </div>
    <p>Click the link below to view the detailed quote proposal and accept it online:</p>
    <a href="{{ $proposalUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      View Proposal
    </a>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">Creativals Studio &bull; No 45, Residency Road, Bangalore - 560025</p>
  </div>
</body>
</html>
