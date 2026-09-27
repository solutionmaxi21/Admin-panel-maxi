import fs from 'fs';

const data = JSON.parse(fs.readFileSync('../database/orders/order-history.json', 'utf8'));

console.log('Total records:', data.length);
console.log('\nID Analysis:');

const ids = [];
data.forEach((h, idx) => {
  const id = h.id || h.status_history_id || h.order_history_id || h.history_id;
  ids.push({ idx, id, fields: Object.keys(h) });
});

// Find all IDs
const allIds = ids.map(i => i.id).filter(Boolean);
const uniqueIds = new Set(allIds);
console.log('Records with IDs:', allIds.length);
console.log('Unique IDs:', uniqueIds.size);
console.log('Records without IDs:', data.length - allIds.length);

// Find duplicates
const counts = {};
allIds.forEach(id => counts[id] = (counts[id] || 0) + 1);
const duplicates = Object.entries(counts).filter(([id, count]) => count > 1);
console.log('\nDuplicate IDs:', duplicates);

// Show first 10 records
console.log('\nFirst 10 records:');
ids.slice(0, 10).forEach(({ idx, id, fields }) => {
  console.log(`  [${idx}] ID=${id} fields=${fields.join(',')}`);
});
