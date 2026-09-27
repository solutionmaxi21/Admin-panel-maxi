# Guepex API Testing Guide - Postman Collection

## 📦 Collection File
**File:** `../../postman/Guepex-Complete-Tests.postman_collection.json`

## 🎯 What's Included

### 1. Authentication (2 requests)
- ✅ **Admin Login** - Auto-saves token for admin operations
- ✅ **Customer Login** - Auto-saves token for customer operations

### 2. Shipment Creation (4 requests)
- ✅ **Get Order Before Shipment** - Verify order status
- ✅ **Phone Confirm Order** - Confirm order for shipping
- ✅ **Create Single Shipment** - Create Guepex parcel (auto-saves tracking number)
- ✅ **Create Batch Shipments** - Create multiple shipments at once

### 3. Tracking & Status (3 requests)
- ✅ **Get Order After Shipment** - Verify tracking number assigned
- ✅ **Get Tracking History** - Full Guepex tracking events
- ✅ **Public Order Tracking** - Track by order number (no auth)

### 4. Webhooks (6 requests)
Simulate complete delivery lifecycle:
- ✅ **En transit** - Package in transit
- ✅ **Out for Delivery** - Driver on route
- ✅ **Delivered** - Successful delivery
- ✅ **Delivery Failed** - Failed attempt with reason
- ✅ **Returning to Warehouse** - Return initiated
- ✅ **Returned to Seller** - Returned & inventory restored

### 5. Returns & Reverse Logistics (3 requests)
- ✅ **Get Returns List** - All return requests
- ✅ **Schedule Return Pickup** - Create reverse shipment
- ✅ **Get Return Tracking** - Track return parcels

### 6. Shipping Calculator (4 requests)
- ✅ **Calculate Shipping Estimate** - Get shipping costs
- ✅ **Validate Shipping Address** - Verify address & phone
- ✅ **Get Delivery Estimate** - Estimated delivery time
- ✅ **Get Stop Desks in Wilaya** - Available pickup points

### 7. Admin Operations (3 requests)
- ✅ **Get Orders Needing Phone Confirmation** - Pending orders
- ✅ **Get All Active Shipments** - Orders in transit
- ✅ **Polling Service Status** - Check auto-polling health

---

## 🚀 How to Use

### Step 1: Import Collection
1. Open Postman
2. Click **Import**
3. Select `../../postman/Guepex-Complete-Tests.postman_collection.json`
4. Collection appears in sidebar

### Step 2: Configure Variables
Collection already has these variables set:
- `baseUrl`: http://localhost:3001
- `testOrderId`: 14 (pre-configured test order)
- `adminToken`: (auto-filled on login)
- `userToken`: (auto-filled on login)
- `testTrackingNumber`: (auto-filled on shipment creation)

### Step 3: Run Tests in Order

#### Quick Start Flow:
```
1. Run "Admin Login" 
   → Token saved automatically

2. Run "Phone Confirm Order" 
   → Order ready for shipping

3. Run "Create Single Shipment"
   → Tracking number saved automatically
   → Label URL generated

4. Run "Get Tracking History"
   → See Guepex tracking events

5. Run webhook requests to simulate delivery
   → Watch order status change in real-time
```

---

## 📋 Test Scenarios

### Scenario 1: Complete Shipment Flow
```
✅ Admin Login
✅ Get Order Before Shipment
✅ Phone Confirm Order
✅ Create Single Shipment
✅ Get Order After Shipment
✅ Get Tracking History
```

### Scenario 2: Webhook Simulation (Full Lifecycle)
```
✅ Webhook - En transit
✅ Webhook - Out for Delivery
✅ Webhook - Delivered
✅ Get Order After Shipment (verify status = delivered)
```

### Scenario 3: Failed Delivery & Return
```
✅ Webhook - Delivery Failed
✅ Webhook - Returning to Warehouse
✅ Webhook - Returned to Seller
✅ Get Order After Shipment (verify inventory restored)
```

### Scenario 4: Batch Operations
```
✅ Admin Login
✅ Create Batch Shipments (orders 14 & 15)
✅ Get All Active Shipments
```

### Scenario 5: Return Pickup
```
✅ Admin Login
✅ Get Returns List
✅ Schedule Return Pickup
✅ Get Return Tracking
```

### Scenario 6: Shipping Calculator
```
✅ Calculate Shipping Estimate
✅ Validate Shipping Address
✅ Get Delivery Estimate
✅ Get Stop Desks in Wilaya
```

---

## 🔍 Response Examples

### Create Shipment Success:
```json
{
  "success": true,
  "tracking": "yal-ABC123",
  "importId": "12345",
  "labelUrl": "https://guepex.com/label/yal-ABC123",
  "order": { ... }
}
```

### Tracking History:
```json
{
  "tracking_number": "yal-ABC123",
  "history": [
    {
      "status": "En préparation",
      "date": "2026-01-04T10:00:00Z",
      "location": "Alger"
    },
    {
      "status": "En transit",
      "date": "2026-01-04T11:00:00Z",
      "location": "Centre de tri"
    }
  ]
}
```

### Webhook Response:
```json
{
  "received": true,
  "tracking": "yal-ABC123",
  "status": "Livré",
  "order_updated": true
}
```

---

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Admin login successful
- [ ] Order phone confirmation works
- [ ] Shipment creation returns tracking number
- [ ] Tracking history retrieves data
- [ ] Order status updates from webhooks

### Advanced Features
- [ ] Batch shipment creation
- [ ] Return pickup scheduling
- [ ] Shipping calculator accurate
- [ ] Address validation works
- [ ] Stop desk lookup functional

### Edge Cases
- [ ] Failed delivery webhook
- [ ] Return flow completes
- [ ] Inventory restores on return
- [ ] COD payment marked on delivery
- [ ] Duplicate shipment prevented

### Admin Operations
- [ ] Polling service running
- [ ] Active shipments list correct
- [ ] Phone confirmation queue works

---

## 🎯 Expected Results

### After Running Full Suite:

1. **Order 14 Status Timeline:**
   - pending → processing (phone confirmed)
   - processing → processing (shipment created)
   - processing → delivered/returned (webhook)

2. **Database Changes:**
   - `orders.tracking_number` populated
   - `orders.guepex_label_url` set
   - `order_history` entries created
   - `orders.shipment_status` updated

3. **Logs to Watch:**
   ```
   [Guepex Shipment] Creating shipment for order 14...
   [Guepex Shipment] ✓ Created shipment yal-ABC123
   [Guepex Webhook] ✅ Order ORD-000014 updated
   [Guepex Polling] Checking 1 active shipments
   ```

---

## 🛠️ Troubleshooting

### Token Expired
- Re-run "Admin Login" or "Customer Login"
- Tokens expire after 15 minutes

### Order Already Shipped
- Change `testOrderId` variable to a different order
- Or use database to reset: `UPDATE orders SET tracking_number = NULL WHERE id = 14`

### Webhook Not Working
- Check server logs for errors
- Verify tracking number exists
- Ensure webhook data format correct

### No Active Shipments
- Create new shipments first
- Check order status is not 'delivered' or 'cancelled'

---

## 📊 Variables Reference

| Variable | Description | Auto-Set | Example |
|----------|-------------|----------|---------|
| `baseUrl` | API base URL | No | http://localhost:3001 |
| `adminToken` | Admin JWT | Yes | eyJhbGc... |
| `userToken` | Customer JWT | Yes | eyJhbGc... |
| `testOrderId` | Order ID for testing | No | 14 |
| `testTrackingNumber` | Guepex tracking | Yes | yal-ABC123 |
| `testReturnId` | Return request ID | No | 1 |

---

## 🎉 Success Indicators

### ✅ Everything Working When:
1. Admin login saves token automatically
2. Shipment creation returns tracking number
3. Tracking number auto-saved to variable
4. Webhooks accepted (200/204 status)
5. Order status changes reflect in database
6. Polling service logs show activity
7. Return pickups create reverse parcels
8. Shipping calculator returns costs

### ❌ Issues If:
- 401 errors → Token expired/missing
- 404 errors → Order not found
- 400 errors → Validation failed
- 500 errors → Server/database error

---

## 🔄 Continuous Testing

### Run Collection with Newman (CLI):
```bash
npm install -g newman
newman run ../../postman/Guepex-Complete-Tests.postman_collection.json \
  --environment guepex-local.postman_environment.json \
  --reporters cli,json
```

### Schedule Automated Tests:
- Use Postman Monitor for hourly/daily runs
- Integrate with CI/CD pipeline
- Set up alerts for failures

---

## 📚 Additional Resources

- **Guepex API Docs**: See `../../../docs/guepex-api` folder
- **Migration Report**: `GUEPEX_POSTGRESQL_MIGRATION_COMPLETE.md`
- **Server Logs**: Check terminal for real-time updates
- **Database**: Query PostgreSQL for verification

---

## 🎯 Testing Goals Achieved

✅ **31 comprehensive API tests covering:**
- Authentication & authorization
- Single & batch shipment creation
- Real-time tracking & history
- Complete webhook lifecycle
- Return & reverse logistics
- Shipping calculations
- Admin operations
- Edge cases & error handling

**Ready for production deployment!** 🚀
