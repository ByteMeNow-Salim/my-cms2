// src/services/MultiSiteCRUDService.js
import { CRUDService } from './CRUDService.js';
import { SiteService } from './SiteService.js';

export class MultiSiteCRUDService extends CRUDService {
    constructor(env) {
        super(env);
        this.siteService = new SiteService(env);
        this.currentSite = null;
    }

    async initializeSite(request) {
        const url = new URL(request.url);
        
        // Extract site identifier from subdomain, domain, or query parameter
        let siteIdentifier = url.searchParams.get('site');
        
        if (!siteIdentifier) {
            // Try to get from hostname
            const hostname = url.hostname;
            this.currentSite = await this.siteService.getSiteByDomain(hostname);
        } else {
            this.currentSite = await this.siteService.getSiteById(siteIdentifier);
        }

        // Fallback to default site
        if (!this.currentSite) {
            this.currentSite = await this.siteService.getDefaultSite();
        }

        if (!this.currentSite) {
            throw new Error('No site configuration found');
        }

        // Set up R2 connection for this site
        this.r2 = await this.siteService.getR2ClientForSite(this.currentSite);
        
        return this.currentSite;
    }

    async getModuleConfig(modulePath) {
        if (!this.currentSite) {
            throw new Error('Site not initialized. Call initializeSite() first.');
        }

        // Check if module is enabled for this site
        if (!this.currentSite.modules.includes(modulePath)) {
            throw new Error(`Module ${modulePath} is not enabled for site ${this.currentSite.site_id}`);
        }

        return super.getModuleConfig(modulePath);
    }

    async uploadFile(file, uploadPath = null) {
        if (!this.currentSite) {
            throw new Error('Site not initialized. Call initializeSite() first.');
        }

        // Validate file type
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (!this.currentSite.allowed_file_types.includes(fileExtension)) {
            throw new Error(`File type .${fileExtension} is not allowed for this site`);
        }

        // Create site-specific upload path
        const sitePath = uploadPath || this.currentSite.file_upload_path || 'uploads/';
        const objectKey = `${this.currentSite.site_id}/${sitePath}${Date.now()}-${file.name}`;
        
        const httpMetadata = { contentType: file.type };
        await this.r2.put(objectKey, file.stream(), { httpMetadata });
        
        const publicUrl = this.siteService.getSitePublicUrl(this.currentSite, objectKey);
        
        return { publicUrl, objectKey };
    }

    getCurrentSite() {
        return this.currentSite;
    }

    async switchSite(siteId) {
        this.currentSite = await this.siteService.getSiteById(siteId);
        if (!this.currentSite) {
            throw new Error(`Site ${siteId} not found`);
        }
        this.r2 = await this.siteService.getR2ClientForSite(this.currentSite);
        return this.currentSite;
    }
}


