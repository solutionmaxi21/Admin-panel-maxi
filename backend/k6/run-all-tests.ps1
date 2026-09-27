# PowerShell version of run-all-tests.sh

# Create results directory
New-Item -ItemType Directory -Force -Path "k6/results" | Out-Null

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "🚀 MaxiStore Performance Test Suite" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$failedTests = 0

function Invoke-Test {
    param(
        [string]$TestName,
        [string]$TestFile
    )
    
    Write-Host "📊 Running $TestName..." -ForegroundColor Yellow
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    k6 run --out "json=k6/results/$TestName-$timestamp.json" --summary-export="k6/results/$TestName-summary.json" "k6/$TestFile"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $TestName PASSED" -ForegroundColor Green
        Write-Host ""
        return $true
    }
    else {
        Write-Host "❌ $TestName FAILED" -ForegroundColor Red
        Write-Host ""
        return $false
    }
}

# Run tests in sequence
if (-not (Invoke-Test "smoke-test" "smoke-test.js")) { 
    $failedTests++ 
}
Start-Sleep -Seconds 2

if (-not (Invoke-Test "api-test" "api-test.js")) { 
    $failedTests++ 
}
Start-Sleep -Seconds 2

if (-not (Invoke-Test "load-test" "load-test.js")) { 
    $failedTests++ 
}
Start-Sleep -Seconds 2

# Only run stress test if all others passed
if ($failedTests -eq 0) {
    Write-Host "⚠️  Running stress test (this may take a while)..." -ForegroundColor Yellow
    if (-not (Invoke-Test "stress-test" "stress-test.js")) { 
        $failedTests++ 
    }
}
else {
    Write-Host "⚠️  Skipping stress test due to previous failures" -ForegroundColor Yellow
}

# Summary
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "📈 Test Suite Summary" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

if ($failedTests -eq 0) {
    Write-Host "✅ All tests passed!" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "❌ $failedTests test(s) failed" -ForegroundColor Red
    exit 1
}