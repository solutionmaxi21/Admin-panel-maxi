/**
 * Image Converter Middleware
 * Converts uploaded images to WebP format using worker threads for non-blocking performance.
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.join(__dirname, 'imageWorker.js');

/**
 * Convert an image file to WebP format using a worker thread.
 * @param {string} inputPath - Absolute path to the input image
 * @param {number} quality - WebP quality (0-100), default 80
 * @returns {Promise<string>} - Path to the converted WebP file
 */
export function convertToWebP(inputPath, quality = 80) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_PATH, {
            workerData: { inputPath, quality },
        });

        worker.on('message', (result) => {
            if (result.success) {
                resolve(result.outputPath);
            } else {
                console.error('[ImageConverter] Worker conversion failed:', result.error);
                // Return original path on failure (graceful degradation)
                resolve(result.originalPath);
            }
        });

        worker.on('error', (error) => {
            console.error('[ImageConverter] Worker error:', error);
            // Return original path on failure (graceful degradation)
            resolve(inputPath);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`[ImageConverter] Worker stopped with exit code ${code}`);
            }
        });
    });
}

/**
 * Express middleware that converts uploaded images to WebP after multer saves them.
 * Updates req.file to reflect the new .webp filename.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function convertUploadedImage(req, res, next) {
    // Skip if no file was uploaded
    if (!req.file) {
        return next();
    }

    try {
        const inputPath = req.file.path;
        const outputPath = await convertToWebP(inputPath);

        // Update req.file with new WebP file info
        const newFilename = path.basename(outputPath);
        req.file.filename = newFilename;
        req.file.path = outputPath;
        req.file.mimetype = 'image/webp';

        // Update originalname to show .webp extension
        const originalExt = path.extname(req.file.originalname);
        req.file.originalname = req.file.originalname.replace(originalExt, '.webp');

        next();
    } catch (error) {
        console.error('[ImageConverter] Middleware error:', error);
        // Continue with original file on error (graceful degradation)
        next();
    }
}

/**
 * Express middleware for converting multiple uploaded images to WebP.
 * Works with upload.array() results.
 */
export async function convertUploadedImages(req, res, next) {
    // Skip if no files were uploaded
    if (!req.files || req.files.length === 0) {
        return next();
    }

    try {
        const conversionPromises = req.files.map(async (file, index) => {
            const inputPath = file.path;
            const outputPath = await convertToWebP(inputPath);

            // Update file info
            const newFilename = path.basename(outputPath);
            req.files[index].filename = newFilename;
            req.files[index].path = outputPath;
            req.files[index].mimetype = 'image/webp';

            const originalExt = path.extname(file.originalname);
            req.files[index].originalname = file.originalname.replace(originalExt, '.webp');
        });

        await Promise.all(conversionPromises);
        next();
    } catch (error) {
        console.error('[ImageConverter] Multi-file middleware error:', error);
        // Continue with original files on error (graceful degradation)
        next();
    }
}

export default { convertToWebP, convertUploadedImage, convertUploadedImages };
