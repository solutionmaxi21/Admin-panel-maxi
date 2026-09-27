/**
 * Image Worker Thread
 * Handles WebP conversion in a separate thread to avoid blocking the main event loop.
 */

import { parentPort, workerData } from 'worker_threads';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function convertToWebP() {
    const { inputPath, quality = 80 } = workerData;

    try {
        // Generate output path with .webp extension
        const ext = path.extname(inputPath);
        const outputPath = inputPath.replace(ext, '.webp');

        // Convert to WebP
        await sharp(inputPath)
            .webp({ quality })
            .toFile(outputPath);

        // Delete original file
        if (inputPath !== outputPath) {
            fs.unlinkSync(inputPath);
        }

        // Send success result back to main thread
        parentPort.postMessage({
            success: true,
            outputPath,
            originalPath: inputPath,
        });
    } catch (error) {
        // Send error back to main thread
        parentPort.postMessage({
            success: false,
            error: error.message,
            originalPath: inputPath,
        });
    }
}

convertToWebP();
