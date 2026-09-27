import fs from 'fs';
import path from 'path';

const filenames = [
  'product-1770906610504-283242036.webp',
  'product-1768498684507-324893450.png',
  'product-1768498296989-431912749.png',
  'product-1771097724315-374006650.webp',
  'product-1771097724329-930863282.webp',
  'product-1771097724326-615632043.webp',
  'product-1771097724341-515898820.webp',
  'product-1771097724346-528787008.webp',
  'product-1767628997570-489692028.jpg',
  'product-1767901773721-882812611.jpg',
  'product-1767380587814-419826569.jpg',
  'product-1767380619627-513925255.jpg',
  'product-1767369814477-675314787.jpg'
];

const uploadsDir = path.join(process.cwd(), 'backend', 'uploads', 'products');

filenames.forEach((name) => {
  const filePath = path.join(uploadsDir, name);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Deleted:', filePath);
    } else {
      console.log('Not found (skipped):', filePath);
    }
  } catch (err) {
    console.error('Error deleting', filePath, err.message);
  }
});
