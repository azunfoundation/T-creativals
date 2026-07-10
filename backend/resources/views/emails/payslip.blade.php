<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Payslip is Available</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d44;">
    <h2 style="color: #7c3aed; margin-top: 0;">Salary Payslip Issued</h2>
    <p>Hello {{ $employee->name }},</p>
    <p>Your salary slip for the month of <strong>{{ date("F", mktime(0, 0, 0, $run->month, 10)) }} {{ $run->year }}</strong> has been processed.</p>
    <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; border: 1px solid #2d2d44; margin: 16px 0;">
      <h3 style="color: #7c3aed; margin: 0 0 12px 0; font-size: 14px;">Salary Breakdown</h3>
      <table style="width: 100%; color: #e2e8f0; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #94a3b8;">Base Salary:</td>
          <td style="padding: 4px 0; text-align: right; font-weight: bold;">{{ $run->currency?->symbol ?? '₹' }}{{ number_format($runItem->base_salary, 2) }}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #94a3b8;">Bonuses/Allowances:</td>
          <td style="padding: 4px 0; text-align: right; font-weight: bold;">{{ $run->currency?->symbol ?? '₹' }}{{ number_format($runItem->bonus_amount, 2) }}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #94a3b8;">Deductions:</td>
          <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #ef4444;">- {{ $run->currency?->symbol ?? '₹' }}{{ number_format($runItem->deductions, 2) }}</td>
        </tr>
        <tr style="border-top: 1px solid #2d2d44;">
          <td style="padding: 8px 0 0 0; color: #e2e8f0; font-weight: bold;">Net Take-Home Salary:</td>
          <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; color: #22c55e; font-size: 15px;">{{ $run->currency?->symbol ?? '₹' }}{{ number_format($runItem->net_salary, 2) }}</td>
        </tr>
      </table>
    </div>
    <p>Please log in to your dashboard to view the complete details and download your official PDF payslip.</p>
    <hr style="border: none; border-top: 1px solid #2d2d44; margin: 24px 0;">
    <p style="color: #64748b; font-size: 12px;">This is a system generated notification. Please contact HR if you find any discrepancies.</p>
  </div>
</body>
</html>
