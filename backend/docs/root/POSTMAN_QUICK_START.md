# Guepex API - Quick Test Guide

## 🎯 Quick Start (5 Minutes)

### 1. Import Collection
```
File → Import → ../../postman/Guepex-Complete-Tests.postman_collection.json
```

### 2. Run in Order

#### **Step 1: Authentication** (folder 1)
- ✅ Admin Login → Saves token automatically
- ✅ Customer Login → Saves token automatically

#### **Step 2: Setup Test Data** (folder 0)
- ✅ Reset Order 14 → Clears tracking for fresh test
- ✅ Confirm Order 15 → Prepares for batch test

#### **Step 3: Create Shipments** (folder 2)
1. Get Order Before Shipment → Check status
2. Phone Confirm Order → Already done if you ran Step 2
3. **Create Single Shipment** → Gets tracking number automatically
4. Create Batch Shipments → Test multiple orders

#### **Step 4: Simulate Webhooks** (folder 4)
Run in sequence to simulate full delivery lifecycle:
1. En transit
2. Out for Delivery
3. Delivered ✅

Or test failed delivery:
1. En transit
2. Out for Delivery
3. Delivery Failed ❌
4. Returning to Warehouse
5. Returned to Seller

---

## 📊 Expected Results

### ✅ Successful Shipment
```json
{
  "success": true,
  "tracking": "yal-ABC123",
  "labelUrl": "https://...",
  "shipment": { ... }
}
```

### ✅ Webhook Accepted
```
Status: 200 OK
(Check tracking history to see update)
```

### ⚠️ Common Errors

**"Order already has tracking number"**
```
💡 Solution: Run "Reset Order 14" from folder 0
```

**"Order must be phone-confirmed"**
```
💡 Solution: Run "Phone Confirm Order" from folder 2
```

**"No valid orders to ship"**
```
💡 Solution: Run "Confirm Order 15" from folder 0
```

---

## 🔍 Variables (Auto-Managed)

| Variable | Value | Auto-Set By |
|----------|-------|-------------|
| `baseUrl` | http://localhost:3001 | Manual |
| `adminToken` | `eyJhbG...` | Admin Login |
| `userToken` | `eyJhbG...` | Customer Login |
| `testOrderId` | 14 | Manual |
| `testOrderId2` | 15 | Manual |
| `testTrackingNumber` | `yal-...` | Create Shipment |
| `testReturnId` | 1 | Manual |

---

## 🧪 Test Scenarios

### Scenario 1: Full Delivery Success
```
1. Reset Order 14
2. Create Single Shipment → Save tracking
3. Webhook: En transit
4. Webhook: Out for Delivery
5. Webhook: Delivered
6. Get Tracking History → See all events
```

### Scenario 2: Failed Delivery with Return
```
1. Reset Order 14
2. Create Single Shipment
3. Webhook: En transit
4. Webhook: Delivery Failed
5. Webhook: Returning to Warehouse
6. Webhook: Returned to Seller
7. Check order status → Should be "returned"
```

### Scenario 3: Batch Operations
```
1. Reset Order 14
2. Confirm Order 15
3. Create Batch Shipments → Process both
4. Get All Active Shipments → See all tracking
```

---

## 🚨 Troubleshooting

### Server Not Responding
```powershell
cd c:\Users\Pc\Downloads\algerian-hardware-e-commerce\backend
node server.js
```
Look for: `✅ PostgreSQL connected successfully`

### Authentication Failed
1. Run "Admin Login" first
2. Check console: Should see `✅ Admin token saved`
3. Token expires in 15 minutes - re-login if needed

### Order Already Shipped
```
Run: "Reset Order 14" from folder 0
This clears tracking and resets order to "processing"
```

### Webhook Not Working
1. Check `testTrackingNumber` variable has value
2. Run "Create Single Shipment" first to get tracking
3. Tracking format: `yal-XXXXXX` (Guepex format)

---

## 📁 Folder Organization

```
📦 Guepex-Complete-Tests
│
├── 0. Test Data Setup ← START HERE after auth
│   ├── Reset Order 14
│   └── Confirm Order 15
│
├── 1. Authentication ← RUN FIRST
│   ├── Admin Login
│   └── Customer Login
│
├── 2. Shipment Creation
│   ├── Get Order Before Shipment
│   ├── Phone Confirm Order
│   ├── Create Single Shipment ★
│   └── Create Batch Shipments
│
├── 3. Tracking & Status
│   ├── Get Order After Shipment
│   ├── Get Tracking History ★
│   └── Public Order Tracking
│
├── 4. Webhooks ← Simulate Guepex updates
│   ├── En transit
│   ├── Out for Delivery
│   ├── Delivered
│   ├── Delivery Failed
│   ├── Returning to Warehouse
│   └── Returned to Seller
│
├── 5. Returns & Reverse Logistics
│   ├── Get Returns List
│   ├── Schedule Return Pickup
│   └── Get Return Tracking
│
├── 6. Shipping Calculator
│   ├── Calculate Shipping Estimate
│   ├── Validate Shipping Address
│   ├── Get Delivery Estimate
│   └── Get Stop Desks in Wilaya
│
└── 7. Admin Operations
    ├── Get Orders Needing Confirmation
    ├── Get All Active Shipments
    └── Polling Service Status
```

---

## 🎯 Success Indicators

### Server Logs (Good)
```
✅ PostgreSQL connected successfully
🚀 Server started on port 3001
[Guepex Polling] Checking 1 active shipments
[Auth] Using token from Authorization header
[Auth] Token decoded - User: admin@maxistore.com Role: admin
```

### Postman Console (Good)
```
✅ Admin token saved
✅ Tracking saved: yal-V95MLN
✅ Order ready for shipment creation
✅ Order 14 reset - ready for new shipment test
```

### Server Logs (Bad)
```
❌ PostgreSQL connection error
❌ Order already has tracking number
❌ No valid orders to ship
❌ Order not found
```

### Postman Console (Bad)
```
❌ Error: Order already has tracking number
💡 Solution: Run "Reset Order 14" from Test Data Setup
```

---

## 🔄 Reset Everything

To start fresh:

```sql
-- In PostgreSQL
UPDATE orders 
SET tracking_number = NULL,
    guepex_tracking_number = NULL,
    current_status = 'processing',
    phone_confirmation_status = 'confirmed'
WHERE id IN (14, 15);
```

Or use Postman:
1. Reset Order 14
2. Confirm Order 15

---

## 📞 Test Credentials

### Admin
```
Email: admin@maxistore.com
Password: admin123
```

### Customer
```
Email: sifoubiad001@gmail.com
Password: customer123
```

### Test Orders
- Order 14: Alger Centre (commune_id: 1601) - Main test order
- Order 15: Secondary order for batch tests
- Total: 85,000 DA (under Guepex 150,000 DA limit)
- Phone: 0676414241

---

## 🚀 Newman CLI (Automated Testing)

```bash
# Install Newman
npm install -g newman

# Run all tests
newman run ../../postman/Guepex-Complete-Tests.postman_collection.json

# Run specific folder
newman run ../../postman/Guepex-Complete-Tests.postman_collection.json \
  --folder "2. Shipment Creation"

# With environment and reporters
newman run ../../postman/Guepex-Complete-Tests.postman_collection.json \
  --reporters cli,json \
  --reporter-json-export results.json
```

---

## 📝 Notes

1. **Order of execution matters** - Run folders 0 and 1 first
2. **Tokens auto-save** - No need to copy/paste
3. **Tracking auto-saves** - Used by webhooks automatically
4. **Reset when needed** - Use folder 0 to clear test data
5. **Check console** - Helpful messages show what to do next
6. **Server must be running** - Start backend before testing

---

**Ready to test!** 🎉

Start with folder 1 (Authentication), then folder 0 (Test Data Setup), then explore the rest.
