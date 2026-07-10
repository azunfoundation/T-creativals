<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Password</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Reset Your Password</h2>
    <p>Hello {{ $user->name }},</p>
    <p>You requested a password reset for your Creativals OS account.</p>
    <p>Click the button below to reset your password:</p>
    <a href="{{ $resetUrl }}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
      Reset Password
    </a>
    <p style="color: #94a3b8; font-size: 13px;">This link expires in 60 minutes. If you did not request this, ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">Or copy this link:<br>{{ $resetUrl }}</p>
  </div>
</body>
</html>
