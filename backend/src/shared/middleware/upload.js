import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { convertUploadedImage, convertUploadedImages } from './imageConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Configure multer
const multerUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: fileFilter
});

/**
 * Upload middleware with automatic WebP conversion.
 * Use upload.single('fieldname') or upload.array('fieldname', maxCount).
 */
export const upload = {
  /**
   * Handle single file upload with WebP conversion
   * @param {string} fieldName - Form field name for the file
   */
  single: (fieldName) => {
    return [
      multerUpload.single(fieldName),
      convertUploadedImage
    ];
  },

  /**
   * Handle multiple file upload with WebP conversion
   * @param {string} fieldName - Form field name for the files
   * @param {number} maxCount - Maximum number of files
   */
  array: (fieldName, maxCount) => {
    return [
      multerUpload.array(fieldName, maxCount),
      convertUploadedImages
    ];
  }
};

export default upload;

