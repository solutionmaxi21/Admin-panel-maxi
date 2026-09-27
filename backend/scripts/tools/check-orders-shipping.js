import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkOrders() {
  try {
    // Get last 3 orders
    const ordersResult = await pool.query(`
      SELECT id, order_number, ordered_at, total_amount, shipping_cost, shipping_snapshot, warehouse_id
      FROM orders 
      ORDER BY ordered_at DESC 
      LIMIT 3
    `);

    for (const order of ordersResult.rows) {
      console.log('\n' + '='.repeat(80));
      console.log(`Order #${order.id}: ${order.order_number}`);
      console.log('='.repeat(80));
      console.log(`Date: ${order.ordered_at}`);
      console.log(`Total Amount: ${order.total_amount} DA`);
      console.log(`Shipping Cost: ${order.shipping_cost} DA`);
      console.log(`Warehouse ID: ${order.warehouse_id}`);

      // Parse shipping snapshot to get commune/city info
      const shippingData = typeof order.shipping_snapshot === 'string'
        ? JSON.parse(order.shipping_snapshot)
        : order.shipping_snapshot;

      console.log(`\nShipping Address: ${shippingData.address_line_1}, ${shippingData.city}, ${shippingData.state}`);

      // Get commune info
      const communeResult = await pool.query(`
        SELECT id, name, wilaya_id, has_stop_desk 
        FROM communes 
        WHERE name ILIKE $1
        LIMIT 1
      `, [shippingData.city]);

      if (communeResult.rows.length > 0) {
        const commune = communeResult.rows[0];
        console.log(`Commune ID: ${commune.id}, Wilaya ID: ${commune.wilaya_id}`);
        console.log(`Has Stop Desk: ${commune.has_stop_desk}`);

        // Get order items
        const itemsResult = await pool.query(`
          SELECT oi.product_id, oi.quantity, oi.unit_price, p.weight_kg, p.product_name
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = $1
        `, [order.id]);

        console.log(`\nOrder Items:`);
        let totalWeight = 0;
        let totalPrice = 0;

        for (const item of itemsResult.rows) {
          console.log(`  - ${item.product_name}: Qty=${item.quantity}, Weight=${item.weight_kg}kg, Price=${item.unit_price}DA`);
          totalWeight += parseFloat(item.weight_kg) * item.quantity;
          totalPrice += parseFloat(item.unit_price);
        }

        console.log(`\nTotal Weight: ${totalWeight}kg`);
        console.log(`Total Product Price: ${totalPrice}DA`);

        // Get shipping fees from both warehouses (Algiers=16, Harrouch=21)
        console.log(`\nShipping Fees for this route:`);
        const feesResult = await pool.query(`
          SELECT from_wilaya_id, to_wilaya_id, zone,
                 cod_percentage, insurance_percentage, oversize_fee
          FROM guepex_shipping_fees
          WHERE from_wilaya_id IN (16, 21) AND to_wilaya_id = $1
        `, [commune.wilaya_id]);

        for (const fee of feesResult.rows) {
          const warehouseName = fee.from_wilaya_id === 16 ? 'Algiers (Wilaya 16)' : 'Harrouch (Wilaya 21)';
          console.log(`\n  From ${warehouseName} to Wilaya ${fee.to_wilaya_id} (Zone ${fee.zone}):`);
          console.log(`    COD Fee: ${fee.cod_percentage}%`);
          console.log(`    Insurance Fee: ${fee.insurance_percentage}%`);
          console.log(`    Oversize Fee (per kg): ${fee.oversize_fee}DA/kg`);
        }

        // Get commune-specific fees
        console.log(`\nCommune-Specific Delivery Fees:`);
        const communeFeesResult = await pool.query(`
          SELECT from_wilaya_id, express_home, express_desk, economic_home, economic_desk
          FROM guepex_commune_fees
          WHERE from_wilaya_id IN (16, 21) AND to_commune_id = $1
        `, [commune.id]);

        for (const fee of communeFeesResult.rows) {
          const warehouseName = fee.from_wilaya_id === 16 ? 'Algiers (Wilaya 16)' : 'Harrouch (Wilaya 21)';
          console.log(`\n  From ${warehouseName}:`);
          console.log(`    Express Home: ${fee.express_home}DA`);
          console.log(`    Express Desk: ${fee.express_desk}DA`);
          console.log(`    Economic Home: ${fee.economic_home}DA`);
          console.log(`    Economic Desk: ${fee.economic_desk}DA`);
        }
      }
    }

    pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    pool.end();
  }
}

checkOrders();
