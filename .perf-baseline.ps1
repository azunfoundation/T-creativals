$ErrorActionPreference = 'Continue'
$base = 'http://localhost:8000/api/v1'
$out = 'C:\creativals company software\.perf.txt'
$r = @()

Start-Sleep -Seconds 62
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' `
  -Body (@{ email = 'founder@creativals.com'; password = 'password' } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.token)"; Accept = 'application/json' }

$endpoints = @(
  '/users?per_page=25', '/leads', '/quotes', '/invoices', '/projects', '/tasks',
  '/timesheets', '/expenses', '/payments', '/reports/dashboard', '/reports/revenue',
  '/reports/clients', '/audit-logs', '/attendance', '/settings'
)
foreach ($e in $endpoints) {
  Start-Sleep -Milliseconds 1200
  # warm + measure second call
  try { Invoke-RestMethod -Uri "$base$e" -Headers $h | Out-Null } catch {}
  Start-Sleep -Milliseconds 1200
  try {
    $ms = (Measure-Command { Invoke-RestMethod -Uri "$base$e" -Headers $h | Out-Null }).TotalMilliseconds
    $r += ("{0,-28} {1,7:N0} ms" -f $e, $ms)
  } catch { $r += "$e FAILED" }
}
$r += 'DONE'
$r | Out-File $out -Encoding utf8
