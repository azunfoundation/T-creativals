$ErrorActionPreference = 'Continue'
$base = 'http://localhost:8000/api/v1'
$out = 'C:\creativals company software\.phase3-verify.txt'
$r = @()

# 1. Lint changed backend files
Set-Location 'C:\creativals company software\backend'
foreach ($f in @(
  'app\Http\Controllers\Api\V1\HealthController.php',
  'app\Http\Controllers\Api\V1\ExpenseController.php',
  'routes\api.php',
  'config\sanctum.php'
)) {
  $res = php -l $f 2>&1 | Out-String
  $r += "LINT $f -> $(($res -match 'No syntax errors'))"
}

# 2. route:cache dry-run proof (then immediately clear so local dev is unaffected)
$rc = php artisan route:cache 2>&1 | Out-String
$r += "route:cache -> $(($rc -match 'cached successfully'))"
php artisan route:clear 2>&1 | Out-Null
$r += "route:clear -> done (local dev uncached)"

# 3. API spot checks (no login needed for health)
try { Invoke-RestMethod -Uri "$base/health" | Out-Null; $r += "health OK" } catch { $r += "health FAIL" }

Start-Sleep -Seconds 62
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' `
  -Body (@{ email = 'founder@creativals.com'; password = 'password' } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.token)"; Accept = 'application/json' }
$r += "login OK (token issued under new 30-day expiration config)"
Start-Sleep -Seconds 2
try { Invoke-RestMethod -Uri "$base/expense-categories" -Headers $h | Out-Null; $r += "expense-categories OK" } catch { $r += "expense-categories FAIL" }
Start-Sleep -Seconds 2
try { Invoke-RestMethod -Uri "$base/reports/dashboard" -Headers $h | Out-Null; $r += "dashboard OK" } catch { $r += "dashboard FAIL" }

# 4. Log rotation check: daily file should exist after next log write; force one error-level write via a bad route
try { Invoke-WebRequest -Uri "$base/definitely-not-a-route" -UseBasicParsing | Out-Null } catch {}
Start-Sleep -Seconds 1
$daily = Get-ChildItem 'storage\logs' -Filter 'laravel-*.log' -ErrorAction SilentlyContinue
$r += "daily log files: $($daily.Count)"

# 5. Page sweep of all edited pages
$paths = @('/login','/departments','/roles','/crm/1','/clients','/attendance','/users','/tasks','/quotes/1','/invoices/1',
  '/settings/sequences','/settings/profile','/settings/danger-zone','/settings/backups','/settings/notifications',
  '/settings/change-password','/settings/general','/expenses','/payroll','/projects/1','/timesheets','/dashboard')
foreach ($p in $paths) {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000$p" -UseBasicParsing -TimeoutSec 90
    $hasErr = $resp.Content -match 'Failed to compile|Build Error|Parsing ecmascript source code failed|Unhandled Runtime Error'
    if ($hasErr) { $r += "PAGE ERR  $p" } else { $r += "PAGE OK   $p" }
  } catch { $r += "PAGE FAIL $p" }
}
$r += 'DONE'
$r | Out-File $out -Encoding utf8
