/**
 * Image reading utilities
 *
 * Corresponds to Python's utils/read_image.py
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * OpenAI vision API format for image content
 */
export interface ImageContent {
    type: 'image_url';
    image_url: {
        url: string;
    };
}

/**
 * MIME type mapping for image extensions
 */
const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};

/**
 * Supported image extensions (SVG is not supported by AI models)
 */
const SUPPORTED_FORMATS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

/**
 * Get MIME type from path or URL
 */
function getMimeType(pathOrUrl: string): string {
    // Remove URL query parameters
    const cleanPath = pathOrUrl.split('?')[0];
    const ext = path.extname(cleanPath).toLowerCase();
    return MIME_TYPES[ext] || 'image/jpeg';
}

/**
 * Check if the file is a supported image format
 *
 * @param imagePath - Path or URL to the image
 * @returns true if the image format is supported (jpeg, jpg, png, gif, webp), false otherwise (svg, etc.)
 */
export function isSupportedImageFile(imagePath: string): boolean {
    const cleanPath = imagePath.split('?')[0];
    const ext = path.extname(cleanPath).toLowerCase();
    return SUPPORTED_FORMATS.has(ext);
}

/**
 * Fetch URL content
 */
async function fetchUrl(url: string): Promise<Buffer> {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Synchronously read image and convert to base64 format
 *
 * @param imagePath - Image path or URL
 * @returns OpenAI vision API format image content
 * @throws Error if image file not found or URL request fails
 */
export function readImage(imagePath: string): ImageContent {
    const mimeType = getMimeType(imagePath);
    let content: Buffer;

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        // For sync version, we don't support URL fetching
        throw new Error('Synchronous URL fetching is not supported. Use areadImage instead.');
    } else {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }
        content = fs.readFileSync(imagePath);
    }

    const b64Content = content.toString('base64');
    const dataUrl = `data:${mimeType};base64,${b64Content}`;

    return {
        type: 'image_url',
        image_url: { url: dataUrl },
    };
}

/**
 * Asynchronously read image and convert to base64 format
 *
 * @param imagePath - Image path or URL
 * @returns OpenAI vision API format image content
 * @throws Error if image file not found or URL request fails
 */
export async function areadImage(imagePath: string): Promise<ImageContent> {
    const mimeType = getMimeType(imagePath);
    let content: Buffer;

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        content = await fetchUrl(imagePath);
    } else {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }
        content = await fs.promises.readFile(imagePath);
    }

    const b64Content = content.toString('base64');
    const dataUrl = `data:${mimeType};base64,${b64Content}`;

    return {
        type: 'image_url',
        image_url: { url: dataUrl },
    };
}
