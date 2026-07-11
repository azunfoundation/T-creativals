<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Lead Assigned to You</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">New Lead Assigned</h2>
    <p>Hello {{ $assigneeName }},</p>
    <p>A lead has been assigned to you in the CRM:</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Company:</strong> {{ $lead->company_name }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Lead Number:</strong> {{ $lead->lead_number ?? 'N/A' }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Priority:</strong> <span style="text-transform: uppercase; font-weight: bold;">{{ $lead->priority ?? 'medium' }}</span></p>
      <p style="margin: 0;"><strong>Estimated Monthly Budget:</strong> {{ $lead->estimated_monthly_budget ? '₹' . number_format((float) $lead->estimated_monthly_budget) : 'Not set' }}</p>
    </div>
    <p>Review the lead and log your first follow-up:</p>
    <a href="{{ $leadUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      Open Lead
    </a>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">This is an automated notification from Creativals OS. You can turn these emails off under Settings → Notifications.</p>
  </div>
</body>
</html>
