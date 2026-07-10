<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Quote {{ $quote->quote_number }}</title>
    <style>
        body { font-family: sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
    </style>
</head>
<body>
    <h1>Quote {{ $quote->quote_number }}</h1>
    <p>Client: {{ $quote->client->name ?? 'N/A' }}</p>
    <p>Issue Date: {{ $quote->issue_date ? $quote->issue_date->format('Y-m-d') : 'N/A' }}</p>
    <p>Valid Until: {{ $quote->valid_until ? $quote->valid_until->format('Y-m-d') : 'N/A' }}</p>

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
            @foreach($quote->items as $item)
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
        <strong>Subtotal:</strong> {{ $quote->subtotal }}<br>
        <strong>Tax:</strong> {{ $quote->tax_amount }}<br>
        <strong>Total:</strong> {{ $quote->total_amount }}
    </p>
</body>
</html>
