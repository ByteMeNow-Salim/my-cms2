// src/services/ImageService.js
import { SysSettingsService } from './SysSettingsService.js';

export class ImageService {
    constructor(env, r2PublicUrl = null) {
        this.env = env;
        this.sysSettings = new SysSettingsService(env);
        this.r2PublicUrl = r2PublicUrl; // Override if provided, otherwise get from settings
    }

    async getR2PublicUrl() {
        if (this.r2PublicUrl) return this.r2PublicUrl;
        try {
            const r2Config = await this.sysSettings.getR2Config();
            return r2Config.public_url || 'https://pub-0852f3a82b534b18991316b054236b23.r2.dev';
        } catch (error) {
            console.warn('Using fallback R2 URL:', error);
            return 'https://pub-0852f3a82b534b18991316b054236b23.r2.dev';
        }
    }

    /**
     * Convert filename to full URL
     * @param {string} filename - Just the filename (e.g., "1755150342789-image1.png")
     * @returns {string} Full URL
     */
    async getImageUrl(filename) {
        if (!filename) return '';
        if (filename.startsWith('http')) return filename; // Already a full URL
        const publicUrl = await this.getR2PublicUrl();
        return `${publicUrl}/${filename}`;
    }

    /**
     * Extract filename from URL
     * @param {string} url - Full URL or filename
     * @returns {string} Just the filename
     */
    getFilename(url) {
        if (!url) return '';
        if (url.startsWith('http')) {
            return url.split('/').pop(); // Extract filename from URL
        }
        return url; // Already just a filename
    }

    /**
     * Validate if filename is an image
     * @param {string} filename 
     * @returns {boolean}
     */
    isImage(filename) {
        if (!filename) return false;
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
        const extension = filename.split('.').pop().toLowerCase();
        return imageExtensions.includes(extension);
    }

    /**
     * Generate HTML for displaying an image
     * @param {string} filename 
     * @param {object} options - Display options
     * @returns {string} HTML string
     */
    renderImageHtml(filename, options = {}) {
        if (!filename) return '';
        
        const {
            maxWidth = '200px',
            maxHeight = '200px',
            showLink = true,
            className = 'cms-image',
            alt = 'Image'
        } = options;

        const imageUrl = this.getImageUrl(filename);
        
        let html = `<img src="${imageUrl}" alt="${alt}" class="${className}" style="max-width: ${maxWidth}; max-height: ${maxHeight}; border: 1px solid #ddd; border-radius: 4px;">`;
        
        if (showLink) {
            html = `<a href="${imageUrl}" target="_blank">${html}</a>`;
        }

        return html;
    }

    /**
     * Process form data to convert image URLs to filenames
     * @param {object} formData 
     * @param {array} imageFields - Array of field names that contain images
     * @returns {object} Processed form data
     */
    processFormData(formData, imageFields = []) {
        const processed = { ...formData };
        
        imageFields.forEach(field => {
            if (processed[field]) {
                processed[field] = this.getFilename(processed[field]);
            }
        });

        return processed;
    }

    /**
     * Process display data to convert filenames to URLs
     * @param {object} data 
     * @param {array} imageFields - Array of field names that contain images
     * @returns {object} Processed data with full URLs
     */
    processDisplayData(data, imageFields = []) {
        const processed = { ...data };
        
        imageFields.forEach(field => {
            if (processed[field]) {
                processed[field + '_url'] = this.getImageUrl(processed[field]);
            }
        });

        return processed;
    }
}


