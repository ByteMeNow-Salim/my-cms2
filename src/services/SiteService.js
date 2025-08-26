// src/services/SiteService.js
export class SiteService {
    constructor(env) {
        this.env = env;
        this.r2 = env.R2; // Default R2 binding
        this.sitesConfig = null;
    }

    async loadSitesConfig() {
        if (!this.sitesConfig) {
            const configObject = await this.r2.get('sites-config.json');
            if (!configObject) {
                throw new Error('Sites configuration not found');
            }
            this.sitesConfig = await configObject.json();
        }
        return this.sitesConfig;
    }

    async getSiteByDomain(domain) {
        const config = await this.loadSitesConfig();
        return config.sites.find(site => 
            site.domain === domain || 
            site.site_id === domain ||
            (site.custom_domains && site.custom_domains.includes(domain))
        );
    }

    async getSiteById(siteId) {
        const config = await this.loadSitesConfig();
        return config.sites.find(site => site.site_id === siteId);
    }

    async getDefaultSite() {
        const config = await this.loadSitesConfig();
        const defaultSiteId = config.default_site;
        return config.sites.find(site => site.site_id === defaultSiteId);
    }

    async getAllSites() {
        const config = await this.loadSitesConfig();
        return config.sites.filter(site => site.status === 'active');
    }

    async getR2ClientForSite(siteConfig) {
        // For now, we'll use the default R2 binding
        // In the future, you can implement dynamic R2 connections
        return this.r2;
    }

    async createSite(siteData) {
        const config = await this.loadSitesConfig();
        
        const newSite = {
            site_id: siteData.site_id,
            site_name: siteData.site_name,
            domain: siteData.domain,
            status: 'active',
            r2_config: siteData.r2_config,
            modules: siteData.modules || [],
            cors_enabled: true,
            file_upload_path: 'uploads/',
            max_file_size: '10MB',
            allowed_file_types: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        config.sites.push(newSite);
        
        // Save updated config
        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put('sites-config.json', JSON.stringify(config, null, 2), { httpMetadata });
        
        return newSite;
    }

    async updateSite(siteId, updates) {
        const config = await this.loadSitesConfig();
        const siteIndex = config.sites.findIndex(site => site.site_id === siteId);
        
        if (siteIndex === -1) {
            throw new Error(`Site ${siteId} not found`);
        }

        config.sites[siteIndex] = {
            ...config.sites[siteIndex],
            ...updates,
            updated_at: new Date().toISOString()
        };

        // Save updated config
        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put('sites-config.json', JSON.stringify(config, null, 2), { httpMetadata });
        
        return config.sites[siteIndex];
    }

    async deleteSite(siteId) {
        const config = await this.loadSitesConfig();
        const siteIndex = config.sites.findIndex(site => site.site_id === siteId);
        
        if (siteIndex === -1) {
            throw new Error(`Site ${siteId} not found`);
        }

        // Mark as inactive instead of deleting
        config.sites[siteIndex].status = 'inactive';
        config.sites[siteIndex].updated_at = new Date().toISOString();

        // Save updated config
        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put('sites-config.json', JSON.stringify(config, null, 2), { httpMetadata });
        
        return true;
    }

    getSitePublicUrl(siteConfig, objectKey) {
        if (siteConfig.r2_config.custom_domain) {
            return `${siteConfig.r2_config.custom_domain}/${objectKey}`;
        }
        return `${siteConfig.r2_config.public_url}/${objectKey}`;
    }
}


