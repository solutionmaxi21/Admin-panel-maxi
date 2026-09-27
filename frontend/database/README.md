# Database Folder

## ⚠️ Important: This is NOT Dead Code

This folder contains **JSON fixture data** that is actively used by the Admin panel.

## Purpose

This folder serves as a data transformation layer for the Admin panel:
- Contains JSON files with product, order, user, and other entity data
- Used by `admin/src/services/dbAdapter.js` to transform data into the format expected by the Admin UI
- Provides backward compatibility with the Admin panel's data structure

## Structure

```
database/
├── catalog/          # Product, category, supplier data
├── inventory/        # Stock and warehouse data
├── orders/           # Order and order item data
├── users/            # User and address data
├── reviews/          # Product reviews
├── returns/          # Return requests
├── promotions/       # Promotional campaigns
└── shipping/         # Shipping and tracking data
```

## Usage

The Admin panel imports these files via `dbAdapter.js`:

```javascript
import categories from '../../../database/catalog/categories.json';
import products from '../../../database/catalog/products.json';
// ... etc
```

## Production Database

**Note**: This is NOT the production database. The production database is:
- **Type**: PostgreSQL
- **Location**: Backend server
- **Schema**: Defined in `backend/prisma/schema.prisma`
- **Access**: Via Backend API at `http://localhost:3001/api`

## Do Not Delete

Deleting this folder will break the Admin panel. If you need to modify the data structure, update both:
1. The JSON files in this folder
2. The transformation logic in `admin/src/services/dbAdapter.js`
