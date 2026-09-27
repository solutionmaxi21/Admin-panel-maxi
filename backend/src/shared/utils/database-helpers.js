import fs from 'fs/promises';
import fsSync from 'fs';

/**
 * Async helper to read JSON files
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Array>} Parsed JSON data or empty array on error
 */
export async function readJSON(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

/**
 * Async helper to write JSON files
 * @param {string} filePath - Path to the JSON file
 * @param {*} data - Data to write
 */
export async function writeJSON(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

/**
 * Sync helper to read JSON files (for backward compatibility)
 * @param {string} filePath - Path to the JSON file
 * @returns {*} Parsed JSON data
 */
export function readJSONSync(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

/**
 * Sync helper to write JSON files (for backward compatibility)
 * @param {string} filePath - Path to the JSON file
 * @param {*} data - Data to write
 */
export function writeJSONSync(filePath, data) {
  try {
    fsSync.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}
