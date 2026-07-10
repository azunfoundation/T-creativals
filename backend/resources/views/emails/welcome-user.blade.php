<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Creativals OS</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Welcome to Creativals OS!</h2>
    <p>Hello {{ $user->name }},</p>
    <p>An account has been created for you on the Creativals OS agency management platform.</p>
    <p>Your login credentials are as follows:</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Login URL:</strong> <a href="{{ $loginUrl }}" style="color: #7c3aed; text-decoration: none;">{{ $loginUrl }}</a></p>
      <p style="margin: 0 0 8px 0;"><strong>Email:</strong> {{ $user->email }}</p>
      <p style="margin: 0;"><strong>Password:</strong> {{ $rawPassword }}</p>
    </div>
    <p style="color: #e2e8f0;">Upon logging in for the first time, you will be prompted to change your password for security reasons.</p>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
