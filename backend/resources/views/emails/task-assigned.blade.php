<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Task Assigned to You</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Task Assigned</h2>
    <p>Hello {{ $task->assignee?->name ?? 'Team Member' }},</p>
    <p>A new task has been assigned to you in the system:</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Task Title:</strong> {{ $task->title }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Project:</strong> {{ $task->project?->name ?? 'N/A' }}</p>
      <p style="margin: 0 0 8px 0;"><strong>Priority:</strong> <span style="text-transform: uppercase; font-weight: bold; color: {{ $task->priority === 'high' ? '#ef4444' : ($task->priority === 'medium' ? '#f59e0b' : '#3b82f6') }}">{{ $task->priority }}</span></p>
      <p style="margin: 0 0 8px 0;"><strong>Due Date:</strong> {{ $task->due_date?->format('d/m/Y') ?? 'No deadline' }}</p>
      <p style="margin: 0;"><strong>Description:</strong> {{ $task->description ?? 'No description provided' }}</p>
    </div>
    <p>You can view and update the progress of this task in your project dashboard:</p>
    <a href="{{ $taskUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      Go to Task
    </a>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">This is an automated notification from Creativals OS.</p>
  </div>
</body>
</html>
