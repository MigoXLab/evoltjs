/**
 * Image reading utilities
 *
 * Corresponds to Python's utils/read_image.py
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileTypeFromBuffer } from 'file-type';

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
 * Get MIME type
 */
async function getMimeType(params: { pathOrUrl: string, content: Buffer }): Promise<string> {
    const { pathOrUrl, content } = params;
    let mimeType = '';

    if (content) {
        const fileType = await fileTypeFromBuffer(content);
        mimeType = fileType?.mime || '';
    } else {
        // Remove URL query parameters
        const cleanPath = pathOrUrl.split('?')[0];
        const ext = path.extname(cleanPath).toLowerCase();
        mimeType = MIME_TYPES[ext] || 'image/jpeg';
    }
    return mimeType;
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
async function fetchImageRemote(url: string): Promise<Buffer> {
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
 * Asynchronously read image and convert to base64 format
 *
 * @param imagePath - Image path or URL
 * @returns OpenAI vision API format image content
 * @throws Error if image file not found or URL request fails
 */
export async function imageToBase64(imagePath: string): Promise<string> {
    let content: Buffer;

    if (/^https?:\/\//i.test(imagePath)) {
        content = await fetchImageRemote(imagePath);
    } else {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }
        content = await fs.promises.readFile(imagePath);
    }

    const mimeType = getMimeType({ pathOrUrl: imagePath, content });

    return `data:${mimeType};base64,${content.toString('base64')}`;
}
