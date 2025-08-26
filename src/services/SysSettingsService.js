// src/services/SysSettingsService.js
export class SysSettingsService {
    constructor(env) {
        this.env = env;
        this.r2 = env.R2;
        this.clientSettingsFile = 'sys-settings.json';
        this.adminSettingsFile = 'sys-settings-admin.json';
        this.clientCache = null;
        this.adminCache = null;
        this.cacheExpiry = 300000; // 5 minutes
    }

    // 🌐 CLIENT SETTINGS (Public API)
    async loadClientSettings(forceRefresh = false) {
        if (!forceRefresh && this.clientCache && this.isClientCacheValid()) {
            return this.clientCache.data;
        }

        try {
            const settingsObject = await this.r2.get(this.clientSettingsFile);
            if (!settingsObject) {
                console.warn('⚠️ sys-settings.json not found, falling back to legacy settings.json');
                return await this.loadLegacySettings();
            }

            const settings = await settingsObject.json();
            this.clientCache = {
                data: settings,
                timestamp: Date.now()
            };

            console.log('🌐 Client settings loaded from sys-settings.json');
            return settings;
        } catch (error) {
            console.error('❌ Failed to load client settings, trying legacy:', error);
            return await this.loadLegacySettings();
        }
    }

    // 🔒 ADMIN SETTINGS (Internal Only)
    async loadAdminSettings(forceRefresh = false) {
        if (!forceRefresh && this.adminCache && this.isAdminCacheValid()) {
            return this.adminCache.data;
        }

        try {
            const settingsObject = await this.r2.get(this.adminSettingsFile);
            if (!settingsObject) {
                console.warn('⚠️ sys-settings-admin.json not found, falling back to legacy sites-config.json');
                return await this.loadLegacySitesConfig();
            }

            const settings = await settingsObject.json();
            this.adminCache = {
                data: settings,
                timestamp: Date.now()
            };

            console.log('🔒 Admin settings loaded from sys-settings-admin.json');
            return settings;
        } catch (error) {
            console.error('❌ Failed to load admin settings, trying legacy:', error);
            return await this.loadLegacySitesConfig();
        }
    }

    // BACKWARD COMPATIBILITY - Load from legacy files
    async loadLegacySettings() {
        try {
            const settingsObject = await this.r2.get('settings.json');
            if (settingsObject) {
                const legacySettings = await settingsObject.json();
                console.log('📁 Loaded from legacy settings.json');
                return this.convertLegacyToClientSettings(legacySettings);
            }
            throw new Error('Legacy settings.json not found');
        } catch (error) {
            console.error('❌ Legacy fallback failed:', error);
            return this.createDefaultClientSettings();
        }
    }

    async loadLegacySitesConfig() {
        try {
            const configObject = await this.r2.get('sites-config.json');
            if (configObject) {
                const legacyConfig = await configObject.json();
                console.log('📁 Loaded from legacy sites-config.json');
                return this.convertLegacyToAdminSettings(legacyConfig);
            }
            throw new Error('Legacy sites-config.json not found');
        } catch (error) {
            console.error('❌ Legacy sites-config fallback failed:', error);
            throw error;
        }
    }

    // Convert legacy settings.json to new client format
    convertLegacyToClientSettings(legacySettings) {
        return {
            config_type: "client_settings",
            version: "1.0.0",
            last_updated: new Date().toISOString(),
            client_id: "legacy",
            site_info: {
                site_name: "Legacy Site",
                default_language: "en",
                timezone: "UTC"
            },
            image_upload: legacySettings.image_upload || {},
            compression_settings: legacySettings.compression_settings || {},
            ui_text: legacySettings.ui_text || {},
            modules: {
                enabled: ["articles", "site-settings"],
                module_settings: {}
            }
        };
    }

    // Convert legacy sites-config.json to new admin format
    convertLegacyToAdminSettings(legacyConfig) {
        const site = legacyConfig.sites?.[0] || {};
        return {
            config_type: "hosting_admin",
            version: "1.0.0",
            last_updated: new Date().toISOString(),
            environment: "production",
            cloudflare: {
                account_id: site.cloudflare_config?.account_id || "",
                zone_id: site.cloudflare_config?.zone_id || "",
                zone_api_token: site.cloudflare_config?.api_token || ""
            },
            r2: {
                bucket_name: site.r2_config?.bucket_name || "",
                access_key_id: site.r2_config?.access_key_id || "",
                secret_access_key: site.r2_config?.secret_access_key || "",
                public_url: site.r2_config?.public_url || ""
            },
            d1: {
                database_name: site.d1_config?.database_name || "",
                database_id: site.d1_config?.database_id || ""
            },
            client_info: {
                client_id: site.site_id || "legacy",
                domain: site.domain || "",
                status: site.status || "active"
            },
            global_settings: legacyConfig.global_settings || {}
        };
    }

    // Update client settings (customers can modify)
    async updateClientSettings(updates) {
        const settings = await this.loadClientSettings(true);
        const updatedSettings = this.deepMerge(settings, updates);
        updatedSettings.last_updated = new Date().toISOString();

        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put(this.clientSettingsFile, JSON.stringify(updatedSettings, null, 2), { httpMetadata });

        this.clientCache = {
            data: updatedSettings,
            timestamp: Date.now()
        };

        console.log('✅ Client settings updated in sys-settings.json');
        return updatedSettings;
    }

    // Update admin settings (hosting provider only)
    async updateAdminSettings(updates, adminKey) {
        const adminSettings = await this.loadAdminSettings();
        
        // Verify admin access
        if (!adminSettings.security?.admin_api_keys?.includes(adminKey)) {
            throw new Error('Unauthorized: Invalid admin key');
        }

        const updatedSettings = this.deepMerge(adminSettings, updates);
        updatedSettings.last_updated = new Date().toISOString();

        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put(this.adminSettingsFile, JSON.stringify(updatedSettings, null, 2), { httpMetadata });

        this.adminCache = {
            data: updatedSettings,
            timestamp: Date.now()
        };

        console.log('🔒 Admin settings updated in sys-settings-admin.json');
        return updatedSettings;
    }

    // BACKWARD COMPATIBLE GETTERS - These maintain exact same interface as before
    async getImageSettings() {
        const settings = await this.loadClientSettings();
        return {
            ...settings.image_upload,
            compression_settings: settings.compression_settings,
            ui_text: settings.ui_text
        };
    }

    async getSiteInfo() {
        const settings = await this.loadClientSettings();
        return settings.site_info || { site_name: "Default Site" };
    }

    async getBranding() {
        const settings = await this.loadClientSettings();
        return settings.branding || {};
    }

    async getModules() {
        const settings = await this.loadClientSettings();
        return settings.modules || { enabled: [] };
    }

    // ADMIN GETTERS - Same interface as before
    async getCloudflareConfig() {
        const settings = await this.loadAdminSettings();
        return settings.cloudflare || {};
    }

    async getR2Config() {
        const settings = await this.loadAdminSettings();
        return settings.r2 || {};
    }

    async getD1Config() {
        const settings = await this.loadAdminSettings();
        return settings.d1 || {};
    }

    async getClientInfo() {
        const settings = await this.loadAdminSettings();
        return settings.client_info || {};
    }

    // SITES-CONFIG COMPATIBILITY - For existing services that expect sites array
    async getSites() {
        const adminSettings = await this.loadAdminSettings();
        const clientSettings = await this.loadClientSettings();
        
        // Return in old sites-config format for compatibility
        return [{
            site_id: adminSettings.client_info?.client_id || "default",
            site_name: clientSettings.site_info?.site_name || "Default Site",
            domain: adminSettings.client_info?.domain || "",
            status: adminSettings.client_info?.status || "active",
            cloudflare_config: adminSettings.cloudflare || {},
            r2_config: adminSettings.r2 || {},
            d1_config: adminSettings.d1 || {},
            modules: clientSettings.modules?.enabled || []
        }];
    }

    async getSiteById(siteId) {
        const sites = await this.getSites();
        return sites.find(site => site.site_id === siteId) || sites[0];
    }

    async getDefaultSite() {
        const sites = await this.getSites();
        return sites[0];
    }

    async getTemplates() {
        const settings = await this.loadClientSettings();
        return settings.templates || {};
    }

    // Helper methods
    isClientCacheValid() {
        return this.clientCache && (Date.now() - this.clientCache.timestamp) < this.cacheExpiry;
    }

    isAdminCacheValid() {
        return this.adminCache && (Date.now() - this.adminCache.timestamp) < this.cacheExpiry;
    }

    deepMerge(target, source) {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    createDefaultClientSettings() {
        return {
            config_type: "client_settings",
            version: "1.0.0",
            last_updated: new Date().toISOString(),
            client_id: "default",
            site_info: {
                site_name: "My CMS Site",
                default_language: "en",
                timezone: "UTC"
            },
            image_upload: {
                compression_enabled: true,
                image_quality: 0.8,
                max_image_dimension: 1920,
                max_file_size: 10485760,
                allowed_file_types: ["image/jpeg", "image/png", "image/gif", "image/webp"]
            },
            modules: {
                enabled: ["articles", "site-settings"]
            }
        };
    }
}

