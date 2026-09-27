# Shipping Calculator & Guepex API Test Script
# Run from backend folder: .\test-shipping-guepex.ps1

$baseUrl = "http://localhost:3001"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SHIPPING CALCULATOR & GUEPEX API TESTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "[TEST 1] Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get
    Write-Host "✅ Status: $($response.status)" -ForegroundColor Green
    Write-Host "   Database: $($response.services.database.status)" -ForegroundColor Gray
    Write-Host "   Cache: $($response.services.cache.status)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Get Wilayas
Write-Host ""
Write-Host "[TEST 2] Get Wilayas" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/shipping/wilayas" -Method Get
    Write-Host "✅ Found $($response.data.Count) wilayas" -ForegroundColor Green
    Write-Host "   First 3: $($response.data[0..2].name -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get Communes for Algiers (wilaya 16)
Write-Host "`n[TEST 3] Get Communes for Algiers (wilaya 16)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/shipping/communes?wilayaId=16" -Method Get
    Write-Host "✅ Found $($response.data.Count) communes in Algiers" -ForegroundColor Green
    if ($response.data.Count -gt 0) {
        Write-Host "   Sample: $($response.data[0].name) (ID: $($response.data[0].id))" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Get Stop Desks/Centers
Write-Host "`n[TEST 4] Get Shipping Centers" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/shipping/centers?wilayaId=16" -Method Get
    Write-Host "✅ Found $($response.data.Count) centers in Algiers" -ForegroundColor Green
    if ($response.data.Count -gt 0) {
        Write-Host "   Sample: $($response.data[0].name)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Calculate Shipping Estimate
Write-Host "`n[TEST 5] Calculate Shipping Estimate" -ForegroundColor Yellow
try {
    $body = @{
        communeId = 1016
        isStopDesk = $false
        items = @(
            @{
                productId = 1
                price = 15000
                quantity = 1
                weight = 1.2
                dimensions = @{
                    length = 30
                    width = 20
                    height = 10
                }
            }
        )
    } | ConvertTo-Json -Depth 10

    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/shipping-estimate" -Method Post -Headers $headers -Body $body
    Write-Host "✅ Shipping calculated successfully" -ForegroundColor Green
    Write-Host "   Warehouse: $($response.data.warehouse)" -ForegroundColor Gray
    Write-Host "   Total Cost: $($response.data.total) DZD" -ForegroundColor Gray
    Write-Host "   Billable Weight: $($response.data.weight.billable) kg" -ForegroundColor Gray
    Write-Host "   Commune: $($response.data.commune.name), $($response.data.commune.wilaya_name)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 6: Validate Address
Write-Host "`n[TEST 6] Validate Address (commune 1016)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/validate-address/1016?isStopDesk=false" -Method Get
    Write-Host "✅ Address valid: $($response.data.valid)" -ForegroundColor Green
    Write-Host "   Commune: $($response.data.commune.name)" -ForegroundColor Gray
    Write-Host "   Deliverable: $($response.data.isDeliverable)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Delivery Estimate
Write-Host "`n[TEST 7] Delivery Time Estimate" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/delivery-estimate/1016" -Method Get
    Write-Host "✅ Delivery estimate retrieved" -ForegroundColor Green
    Write-Host "   Min days: $($response.data.minDays)" -ForegroundColor Gray
    Write-Host "   Max days: $($response.data.maxDays)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 8: Get Stop Desks in Wilaya
Write-Host "`n[TEST 8] Get Stop Desks in Wilaya 16 (Algiers)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/stop-desks/16" -Method Get
    Write-Host "✅ Found $($response.data.Count) stop desks" -ForegroundColor Green
    if ($response.data.Count -gt 0) {
        Write-Host "   Sample: $($response.data[0].name)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 9: Test Webhook Endpoint (GET validation)
Write-Host "`n[TEST 9] Guepex Webhook Validation Endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/webhooks/guepex" -Method Get
    Write-Host "✅ Webhook endpoint active" -ForegroundColor Green
    Write-Host "   Service: $($response.service)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 10: Simulate Webhook Event (parcel status update)
Write-Host "`n[TEST 10] Simulate Guepex Webhook Event" -ForegroundColor Yellow
try {
    $webhookPayload = @{
        type = "parcel_status_updated"
        events = @(
            @{
                event_id = "test_event_$(Get-Date -Format 'yyyyMMddHHmmss')"
                occurred_at = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
                data = @{
                    tracking = "yal-S73PCF"
                    status = "picked_up"
                    reason = "Test webhook simulation"
                }
            }
        )
    } | ConvertTo-Json -Depth 10

    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/webhooks/guepex" -Method Post -Headers $headers -Body $webhookPayload
    Write-Host "✅ Webhook accepted (check server logs for processing)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 11: Public Order Tracking (if tracking number exists)
Write-Host "`n[TEST 11] Public Order Tracking" -ForegroundColor Yellow
try {
    $trackBody = @{
        orderNumber = "ORD-00001"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/orders/track" -Method Post -Headers $headers -Body $trackBody
    Write-Host "✅ Order found" -ForegroundColor Green
    Write-Host "   Order: $($response.data.orderNumber)" -ForegroundColor Gray
    Write-Host "   Status: $($response.data.currentStatus)" -ForegroundColor Gray
    Write-Host "   Tracking: $($response.data.trackingNumber)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "⚠️  Order not found (expected if no orders exist)" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TESTS COMPLETE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Note: Admin-only endpoints (create shipment, batch, polling) require authentication token." -ForegroundColor Gray
Write-Host "   To test those, first login as admin and get a JWT token." -ForegroundColor Gray
Write-Host ""

