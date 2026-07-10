<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Payroll Export</title>
    <style>
        body { font-family: sans-serif; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Payroll Export</h2>
        <p>Period: {{ $run->month }}/{{ $run->year }}</p>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Employee</th>
                <th>Base Salary</th>
                <th>Bonus</th>
                <th>Deductions</th>
                <th>Net Salary</th>
            </tr>
        </thead>
        <tbody>
            @foreach($run->items as $item)
            <tr>
                <td>{{ $item->user->name }}</td>
                <td>{{ $item->base_salary }}</td>
                <td>{{ $item->bonus_amount }}</td>
                <td>{{ $item->deductions }}</td>
                <td>{{ $item->net_salary }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
