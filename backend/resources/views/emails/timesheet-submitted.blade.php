<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Timesheet Submitted for Approval</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Timesheet Submitted</h2>
    <p>Hello,</p>
    <p>A timesheet has been submitted by <strong>{{ $timesheet->user->name }}</strong> and is pending your review/approval.</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Employee:</strong> {{ $timesheet->user->name }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Date:</strong> {{ $timesheet->date?->format('d/m/Y') ?? 'N/A' }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Hours Logged:</strong> {{ $timesheet->hours_logged }} hrs</p>
      <p style="margin: 0 0 8px 0;"><strong>Project:</strong> {{ $timesheet->project?->name ?? 'N/A' }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Task:</strong> {{ $timesheet->task?->title ?? 'N/A' }}</p>
      <p style="margin: 0;"><strong>Notes:</strong> {{ $timesheet->notes ?? 'None' }}</p>
    </div>
    <p>Please log in to the system to approve or reject this timesheet entry:</p>
    <a href="{{ $approvalUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      View Approvals Dashboard
    </a>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">This is an automated notification from Creativals OS.</p>
  </div>
</body>
</html>
