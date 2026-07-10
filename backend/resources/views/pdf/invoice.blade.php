<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice {{ $invoice->invoice_number }}</title>
    <style>
        body { font-family: sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
    </style>
</head>
<body>
    <h1>Invoice {{ $invoice->invoice_number }}</h1>
    <p>Client: {{ $invoice->client->name ?? 'N/A' }}</p>
    <p>Issue Date: {{ $invoice->issue_date ? $invoice->issue_date->format('Y-m-d') : 'N/A' }}</p>
    <p>Due Date: {{ $invoice->due_date ? $invoice->due_date->format('Y-m-d') : 'N/A' }}</p>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
            @foreach($invoice->items as $item)
            <tr>
                <td>{{ $item->name }}</td>
                <td>{{ $item->quantity }}</td>
                <td>{{ $item->unit_price }}</td>
                <td>{{ $item->total_amount }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>

    <p style="text-align: right; margin-top: 20px;">
        <strong>Subtotal:</strong> {{ $invoice->subtotal }}<br>
        <strong>Tax:</strong> {{ $invoice->tax_amount }}<br>
        <strong>Total:</strong> {{ $invoice->total_amount }}
    </p>
</body>
</html>
