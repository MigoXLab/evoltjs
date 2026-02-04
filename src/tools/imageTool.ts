/**
 * ImageTool - Tool for reading images from paths or URLs
 *
 * Corresponds to Python's tools/image_tool.py
 */

import { Message } from '../schemas/message';
import { isSupportedImageFile, areadImage } from '../utils/readImage';
import { tools } from './toolRegister';
import { logger } from '../utils';

/**
 * Tool for reading images from paths or URLs
 */
@tools({
    readImage: {
        description: 'Read and analyze an image (JPEG, JPG, PNG, GIF, WebP) from image path or URL. Note: SVG format is not supported by the AI model.',
        params: [
            { name: 'imagePath', type: 'string', description: 'Image path or URL' },
            { name: 'instruction', type: 'string', description: 'Instruction for analyzing the image', optional: true },
        ],
        returns: { type: 'Message', description: 'Message containing image content in base64 format' },
    },
    readImages: {
        description: 'Read images (JPEG, JPG, PNG, GIF, WebP) from image paths or URLs. Note: SVG format is not supported by the AI model and will be automatically filtered out.',
        params: [
            { name: 'imagePaths', type: 'array', description: 'List of image paths or URLs' },
            { name: 'instruction', type: 'string', description: 'Instruction for reading the images', optional: true },
        ],
        returns: { type: 'Message', description: 'Message containing multiple image contents in base64 format' },
    },
})
export class ImageTool {
    /**
     * Read and analyze an image (JPEG, JPG, PNG, GIF, WebP) from image path or URL.
     *
     * Note: SVG format is not supported by the AI model.
     *
     * @param imagePath - Image path or URL
     * @param instruction - Instruction for analyzing the image
     * @returns Message containing image content in base64 format
     */
    async readImage(imagePath: string, instruction: string = ''): Promise<Message> {
        try {
            // Check if image format is supported
            if (!isSupportedImageFile(imagePath)) {
                logger.warn(`Unsupported image format: ${imagePath}. Only JPEG, PNG, GIF, and WebP are supported.`);
                const errorMsg = new Message(
                    'user',
                    `Error: Unsupported image format '${imagePath}'. Only JPEG, PNG, GIF, and WebP are supported by the AI model.`
                );
                return errorMsg;
            }

            const imageContent = await areadImage(imagePath);

            // Build analysis instruction
            let content: string;
            if (instruction) {
                // When there's an explicit instruction, ask LLM to analyze according to it
                content = `Please analyze the image from ${imagePath} according to the following instruction:\n\n${instruction}\n\nPlease provide a detailed analysis of the image content based on this instruction.`;
            } else {
                // When no instruction, ask LLM to describe the image in detail
                content = `Please analyze and describe the image from ${imagePath} in detail. Include information about:\n- What is shown in the image\n- Key elements, objects, or features\n- Colors, composition, and visual characteristics\n- Any text or symbols present\n- Overall context and meaning`;
            }

            const msg = new Message('user', content);
            msg.imagesContent = [imageContent];
            msg.tag = 'image_content';
            return msg;
        } catch (error) {
            return new Message('user', `Error reading image ${imagePath}: ${error}`);
        }
    }

    /**
     * Read images (JPEG, JPG, PNG, GIF, WebP) from image paths or URLs.
     *
     * Note: SVG format is not supported by the AI model and will be automatically filtered out.
     *
     * @param imagePaths - List of image paths or URLs
     * @param instruction - Instruction for reading the images
     * @returns Message containing multiple image contents in base64 format
     */
    async readImages(imagePaths: string[], instruction: string = ''): Promise<Message> {
        try {
            // Filter supported image formats
            const supportedPaths = imagePaths.filter(path => isSupportedImageFile(path));
            const unsupportedPaths = imagePaths.filter(path => !isSupportedImageFile(path));

            // Log unsupported formats
            if (unsupportedPaths.length > 0) {
                logger.warn(
                    `Skipping unsupported image formats (only JPEG/PNG/GIF/WebP are supported): ${unsupportedPaths.join(', ')}`
                );
            }

            if (supportedPaths.length === 0) {
                return new Message(
                    'user',
                    `No supported image formats found in the provided list. Only JPEG, PNG, GIF, and WebP are supported. Unsupported files: ${unsupportedPaths.join(', ')}`
                );
            }

            // Read supported images
            const imageContents = await Promise.all(
                supportedPaths.map(imagePath => areadImage(imagePath))
            );

            // Build return message
            const contentParts = [`Successfully loaded ${supportedPaths.length} image(s): ${supportedPaths.join(', ')}`];
            if (unsupportedPaths.length > 0) {
                contentParts.push(`Skipped ${unsupportedPaths.length} unsupported file(s): ${unsupportedPaths.join(', ')}`);
            }

            const msg = new Message('user', contentParts.join('\n'));
            msg.imagesContent = imageContents;
            return msg;
        } catch (error) {
            return new Message('user', `Error reading images ${imagePaths.join(', ')}: ${error}`);
        }
    }
}
