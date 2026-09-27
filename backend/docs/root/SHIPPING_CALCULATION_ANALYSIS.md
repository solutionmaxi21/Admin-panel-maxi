# Shipping Price Calculation Analysis - Last 3 Orders

## Overview
This document explains how the shipping prices for the last 3 orders were calculated using the Guepex shipping calculator system.

---

## Order #40: ORD-1769531937415370
**Date:** Jan 27, 2026 17:38:57 UTC  
**Destination:** Sétif, Wilaya 19 (Zone 2)  
**Total Order Amount:** 231,168 DA  
**Shipping Cost:** 2,168 DA

### Order Details
- **Product:** Samsung Galaxy S24 Ultra 512GB
- **Quantity:** 1
- **Unit Price:** 229,000 DA
- **Product Weight:** 1.0 kg
- **Warehouse:** 1 (Algiers)

### Shipping Calculation Breakdown

**Step 1: Determine Billable Weight**
- Actual Weight: 1.0 kg
- No dimensions provided, so volumetric weight = 0 kg
- **Billable Weight:** 1.0 kg (max of actual vs volumetric)

**Step 2: Select Delivery Type & Location**
- Delivery Type: Economic (default)
- Delivery Location: Home delivery (default, not Stop Desk)

**Step 3: Base Delivery Fee (Economic Home)**
- From Algiers (Wilaya 16) to Commune 1955 (Sétif):
  - **Economic Home Fee:** 600 DA
  
- From Harrouch (Wilaya 21) to Commune 1955 (Sétif):
  - **Economic Home Fee:** 600 DA

**Step 4: COD (Cash on Delivery) Fee**
- Formula: `max(product_price, declared_value) × COD_percentage / 100`
- COD Percentage (Zone 2): 0.75%
- Calculation: 229,000 × 0.75% = **1,717.50 DA** (rounded to 1,718 DA)

**Step 5: Insurance Fee**
- Insurance Percentage: 0.00% (no insurance added)
- **Insurance Fee:** 0 DA

**Step 6: Oversize/Overweight Fee**
- Weight Threshold: 5 kg
- Product Weight: 1.0 kg (below threshold)
- Extra kg beyond threshold: max(0, 1.0 - 5) = 0 kg
- Oversize Fee per kg: 50 DA/kg
- **Oversize Fee:** 0 DA

**Step 7: Total Shipping Cost**
```
Total = Base Fee + COD Fee + Insurance Fee + Oversize Fee
Total = 600 + 1,718 + 0 + 0 = 2,318 DA
```

⚠️ **Note:** The database shows **2,168 DA**, which is slightly lower than calculated (150 DA difference). This could be due to:
- A discount applied
- Different fee structure at order time
- Rounding differences in the implementation

---

## Order #39: ORD-1769531177187398
**Date:** Jan 27, 2026 17:26:17 UTC  
**Destination:** Sétif, Wilaya 19 (Zone 2)  
**Total Order Amount:** 21,608 DA  
**Shipping Cost:** 608 DA

### Order Details
- **Product:** test 2027
- **Quantity:** 1
- **Unit Price:** 21,000 DA
- **Product Weight:** 2.0 kg
- **Warehouse:** 2 (Harrouch)

### Shipping Calculation Breakdown

**Step 1: Determine Billable Weight**
- Actual Weight: 2.0 kg
- No dimensions provided, so volumetric weight = 0 kg
- **Billable Weight:** 2.0 kg

**Step 2: Select Delivery Type & Location**
- Delivery Type: Economic (default)
- Delivery Location: Home delivery (default)

**Step 3: Base Delivery Fee (Economic Home)**
- From Harrouch (Wilaya 21) to Commune 1955:
  - **Economic Home Fee:** 600 DA

**Step 4: COD Fee**
- Formula: 21,000 × 0.75% = **157.50 DA** (rounded to 158 DA)

**Step 5: Insurance Fee**
- Insurance Percentage: 0.00%
- **Insurance Fee:** 0 DA

**Step 6: Oversize Fee**
- Extra kg beyond 5 kg threshold: max(0, 2.0 - 5) = 0 kg
- **Oversize Fee:** 0 DA

**Step 7: Total Shipping Cost**
```
Total = 600 + 158 + 0 + 0 = 758 DA
```

⚠️ **Variance:** Database shows **608 DA** (150 DA less). Similar to Order #40, there's a consistent 150 DA difference, suggesting a possible discount or fee adjustment.

---

## Order #38: ORD-1769530900119242
**Date:** Jan 27, 2026 17:21:40 UTC  
**Destination:** Sétif, Wilaya 19 (Zone 2)  
**Total Order Amount:** 21,608 DA  
**Shipping Cost:** 608 DA

### Order Details
- **Product:** test 2027
- **Quantity:** 1
- **Unit Price:** 21,000 DA
- **Product Weight:** 2.0 kg
- **Warehouse:** 2 (Harrouch)

### Shipping Calculation Breakdown

**Identical to Order #39** (same product, weight, destination, and warehouse)

**Total Shipping Cost Calculation:**
```
Base Fee (Economic Home):     600 DA
COD Fee (21,000 × 0.75%):     158 DA
Insurance Fee:                  0 DA
Oversize Fee:                   0 DA
────────────────────────────────────
Total Calculated:             758 DA
Database Value:               608 DA
Difference:                  -150 DA (discount)
```

---

## Summary Table

| Order # | Product | Weight | Price | Base Fee | COD Fee | Total Calc | DB Value | Variance |
|---------|---------|--------|-------|----------|---------|-----------|----------|----------|
| 40 | Samsung S24 Ultra | 1kg | 229,000 DA | 600 DA | 1,718 DA | 2,318 DA | 2,168 DA | -150 DA |
| 39 | test 2027 | 2kg | 21,000 DA | 600 DA | 158 DA | 758 DA | 608 DA | -150 DA |
| 38 | test 2027 | 2kg | 21,000 DA | 600 DA | 158 DA | 758 DA | 608 DA | -150 DA |

---

## Shipping Calculation Formula (Guepex System)

### Components:
1. **Base Delivery Fee** - Fixed per route/commune/delivery type
   - Economic Home/Desk
   - Express Home/Desk
   - Varies by destination zone

2. **COD Fee** - Percentage-based on product price
   - Formula: `max(product_price, declared_value) × cod_percentage / 100`
   - Zone 2 (Sétif): 0.75%

3. **Insurance Fee** - Optional percentage-based
   - Formula: `declared_value × insurance_percentage / 100`
   - Not applied in these orders

4. **Oversize/Overweight Fee** - Per extra kg beyond 5kg threshold
   - Formula: `max(0, billable_weight - 5) × oversize_fee_per_kg`
   - Zone 2: 50 DA/kg
   - None of these orders exceeded 5kg

### Billable Weight Calculation:
- **Actual Weight:** From product specifications (weight_kg field)
- **Volumetric Weight:** `(length × width × height × 0.0002)` rounded up
  - Formula uses dimensions in cm
  - Only applied if product dimensions are provided
- **Billable Weight:** `MAX(actual_weight, volumetric_weight)`

### Warehouse Selection:
The system chooses the cheapest route between:
- Algiers (Wilaya 16)
- Harrouch (Wilaya 21)

Both warehouses have identical pricing for Sétif in this case.

---

## Key Observations

1. **150 DA Variance:** All three orders show a consistent 150 DA difference between calculated and actual shipping costs. This suggests:
   - A promotional discount was applied to shipping
   - A loyalty/bulk discount
   - A system adjustment or rounding rule

2. **Zone Determination:** All orders go to Sétif (Wilaya 19, Zone 2)
   - Zone 2 has standard rates (not Zone 1-5 variations)

3. **Economic Delivery:** All orders used economic home delivery
   - No express shipping selected
   - No stop desk delivery

4. **Low COD Percentage:** The 0.75% COD fee is reasonable for high-value items
   - Order #40 with 229,000 DA product = 1,718 DA fee
   - Orders #39 & #38 with 21,000 DA product = 158 DA fee each

5. **No Weight Penalties:** All products are below the 5kg threshold, so no oversize fees apply
