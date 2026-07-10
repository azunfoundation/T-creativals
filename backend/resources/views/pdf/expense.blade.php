<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Expense {{ $expense->expense_number }}</title>
    <style>
        body { font-family: sans-serif; color: #111827; font-size: 13px; }
        h1 { font-size: 20px; margin-bottom: 2px; }
        .muted { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px; border: 1px solid #ddd; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; width: 30%; }
        .totals { margin-top: 20px; text-align: right; }
        .status { text-transform: uppercase; font-weight: bold; }
        .footer { margin-top: 40px; font-size: 11px; color: #6b7280; }
    </style>
</head>
<body>
    <h1>Expense Voucher {{ $expense->expense_number }}</h1>
    <p class="muted">Creativals Agency Pvt Ltd &mdash; Internal Expense Record</p>

    <table>
        <tr><th>Title</th><td>{{ $expense->title }}</td></tr>
        @if($expense->description)
        <tr><th>Description</th><td>{{ $expense->description }}</td></tr>
        @endif
        <tr><th>Status</th><td class="status">{{ str_replace('_', ' ', $expense->status) }}</td></tr>
        <tr><th>Expense Date</th><td>{{ $expense->expense_date ? $expense->expense_date->format('d M Y') : 'N/A' }}</td></tr>
        <tr><th>Category</th><td>{{ $expense->category->name ?? 'Uncategorized' }}</td></tr>
        <tr><th>Vendor</th><td>{{ $expense->vendor->name ?? '—' }}</td></tr>
        <tr><th>Project</th><td>{{ $expense->project->name ?? 'General Overheads' }}</td></tr>
        <tr><th>Submitted By</th><td>{{ $expense->submitter->name ?? 'N/A' }}</td></tr>
        @if($expense->approver)
        <tr><th>{{ $expense->status === 'rejected' ? 'Rejected By' : 'Approved By' }}</th><td>{{ $expense->approver->name }}</td></tr>
        @endif
        @if($expense->payment_method)
        <tr><th>Payment Method</th><td>{{ ucwords(str_replace('_', ' ', $expense->payment_method)) }}</td></tr>
        @endif
        <tr><th>Billable to Client</th><td>{{ $expense->is_billable ? 'Yes (Billable)' : 'No (Internal)' }}</td></tr>
        @if($expense->notes)
        <tr><th>Notes</th><td>{{ $expense->notes }}</td></tr>
        @endif
        @if($expense->rejection_reason)
        <tr><th>Rejection Reason</th><td>{{ $expense->rejection_reason }}</td></tr>
        @endif
        @if($expense->receipt_url)
        <tr><th>Receipt</th><td>{{ $expense->receipt_url }}</td></tr>
        @endif
        @if($expense->attachments->isNotEmpty())
        <tr>
            <th>Attachments</th>
            <td>
                @foreach($expense->attachments as $attachment)
                    {{ $attachment->title }} &mdash; {{ $attachment->url }}<br>
                @endforeach
            </td>
        </tr>
        @endif
    </table>

    <p class="totals">
        <strong>Amount:</strong> {{ $expense->currency->code ?? '' }} {{ number_format((float) $expense->amount, 2) }}<br>
        <strong>Tax / GST:</strong> {{ $expense->currency->code ?? '' }} {{ number_format((float) ($expense->tax_amount ?? 0), 2) }}<br>
        <strong>Total:</strong> {{ $expense->currency->code ?? '' }} {{ number_format((float) $expense->amount + (float) ($expense->tax_amount ?? 0), 2) }}
    </p>

    <p class="footer">
        Generated on {{ now()->format('d M Y H:i') }} &mdash; Record created {{ $expense->created_at?->format('d M Y H:i') }},
        last updated {{ $expense->updated_at?->format('d M Y H:i') }}.
    </p>
</body>
</html>
