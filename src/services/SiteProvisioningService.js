// src/services/SiteProvisioningService.js
export class SiteProvisioningService {
    constructor(env) {
        this.env = env;
        this.r2 = env.R2;
    }

    async createSiteFromDashboard(siteData) {
        const { 
            site_id, 
            site_name, 
            domain, 
            cloudflare_account_id,
            api_token,
            template = 'standard',
            zone_id = null 
        } = siteData;

        console.log(`Starting site creation for ${site_id}...`);

        try {
            // 1. Create R2 Bucket
            const r2Config = await this.createR2Bucket(site_id, cloudflare_account_id, api_token);
            console.log('✅ R2 bucket created');

            // 2. Create D1 Database
            const d1Config = await this.createD1Database(site_id, cloudflare_account_id, api_token);
            console.log('✅ D1 database created');

            // 3. Get template configuration
            const templateConfig = await this.getTemplate(template);
            console.log('✅ Template loaded');

            // 4. Create site configuration
            const newSiteConfig = {
                site_id,
                site_name,
                domain,
                status: 'provisioning',
                cloudflare_config: {
                    account_id: cloudflare_account_id,
                    zone_id: zone_id,
                    api_token: api_token
                },
                r2_config: {
                    ...r2Config,
                    auto_create: true
                },
                d1_config: {
                    ...d1Config,
                    auto_create: true,
                    schema_version: "1.0"
                },
                worker_config: {
                    worker_name: `${site_id}-cms`,
                    subdomain: site_id,
                    routes: zone_id ? [{
                        pattern: `${domain}/*`,
                        zone_id: zone_id
                    }] : [],
                    auto_deploy: true
                },
                modules: templateConfig.modules,
                template: template,
                cors_enabled: true,
                file_upload_path: "uploads/",
                max_file_size: "10MB",
                allowed_file_types: ["jpg", "jpeg", "png", "gif", "pdf", "doc", "docx"],
                auto_provision: {
                    enabled: true,
                    create_r2_bucket: true,
                    create_d1_database: true,
                    setup_domain_routing: !!zone_id,
                    deploy_worker: true,
                    initialize_data: true
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 5. Initialize database schema
            await this.initializeD1Schema(d1Config.database_id, cloudflare_account_id, api_token);
            console.log('✅ D1 schema initialized');

            // 6. Setup initial data files in R2
            await this.initializeSiteData(site_id, templateConfig, r2Config);
            console.log('✅ Initial data created');

            // 7. Add to sites configuration
            await this.addSiteToConfig(newSiteConfig);
            console.log('✅ Site added to configuration');

            // 8. Deploy worker (if auto-deploy enabled)
            if (newSiteConfig.auto_provision.deploy_worker) {
                await this.deployWorkerForSite(newSiteConfig);
                console.log('✅ Worker deployed');
            }

            // 9. Setup domain routing (if zone_id provided)
            if (zone_id && newSiteConfig.auto_provision.setup_domain_routing) {
                await this.setupDomainRouting(newSiteConfig);
                console.log('✅ Domain routing configured');
            }

            // 10. Update status to active
            newSiteConfig.status = 'active';
            await this.updateSiteConfig(site_id, { status: 'active' });

            console.log(`🎉 Site ${site_id} created successfully!`);
            return newSiteConfig;

        } catch (error) {
            console.error(`❌ Error creating site ${site_id}:`, error);
            // Cleanup on failure
            await this.cleanupFailedSite(site_id, cloudflare_account_id, api_token);
            throw error;
        }
    }

    async createR2Bucket(bucketName, accountId, apiToken) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: bucketName })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create R2 bucket: ${error}`);
        }

        const result = await response.json();
        
        // Generate R2 credentials
        const credentialsResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/tokens`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: `${bucketName}-token`,
                permissions: {
                    "com.cloudflare.api.account.r2.bucket": "*"
                }
            })
        });

        const credentials = await credentialsResponse.json();

        return {
            bucket_name: bucketName,
            access_key_id: credentials.result.accessKeyId,
            secret_access_key: credentials.result.secretAccessKey,
            public_url: `https://pub-${accountId}.r2.dev`,
            custom_domain: null
        };
    }

    async createD1Database(databaseName, accountId, apiToken) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: databaseName })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create D1 database: ${error}`);
        }

        const result = await response.json();
        
        return {
            database_name: databaseName,
            database_id: result.result.uuid
        };
    }

    async initializeD1Schema(databaseId, accountId, apiToken) {
        const schema = `
        CREATE TABLE IF NOT EXISTS sites (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            config TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS content (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            module TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS uploads (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            url TEXT NOT NULL,
            size INTEGER,
            type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`;

        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql: schema })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to initialize D1 schema: ${error}`);
        }

        return await response.json();
    }

    async initializeSiteData(siteId, templateConfig, r2Config) {
        // Create initial data files based on template
        const initialData = {
            'sys-modules.json': {
                modules: templateConfig.modules.map(module => ({
                    label: this.getModuleLabel(module),
                    icon_class: this.getModuleIcon(module),
                    group: this.getModuleGroup(module),
                    path: module,
                    storage_type: "array",
                    data_file: `${module}.json`,
                    form_definition_file: `forms/${module}.json`,
                    id_field: `${module}_id`
                }))
            },
            'site-settings.json': {
                site_name: `Site ${siteId}`,
                theme: templateConfig.theme || 'default',
                timezone: 'UTC',
                language: 'en',
                created_at: new Date().toISOString()
            }
        };

        // Upload initial data to R2
        const httpMetadata = { contentType: 'application/json' };
        for (const [filename, data] of Object.entries(initialData)) {
            const objectKey = `${siteId}/${filename}`;
            await this.r2.put(objectKey, JSON.stringify(data, null, 2), { httpMetadata });
        }
    }

    async addSiteToConfig(newSiteConfig) {
        // Load current config
        const configObject = await this.r2.get('sites-config.json');
        const config = configObject ? await configObject.json() : { sites: [] };
        
        // Add new site
        config.sites.push(newSiteConfig);
        
        // Save updated config
        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put('sites-config.json', JSON.stringify(config, null, 2), { httpMetadata });
    }

    async getTemplate(templateName) {
        const configObject = await this.r2.get('sites-config.json');
        const config = await configObject.json();
        return config.templates[templateName] || config.templates.standard;
    }

    getModuleLabel(module) {
        const labels = {
            'articles': 'Articles',
            'products': 'Products',
            'gallery': 'Gallery',
            'forms': 'Forms',
            'site-settings': 'Site Settings'
        };
        return labels[module] || module.charAt(0).toUpperCase() + module.slice(1);
    }

    getModuleIcon(module) {
        const icons = {
            'articles': 'fas fa-newspaper',
            'products': 'fas fa-box',
            'gallery': 'fas fa-images',
            'forms': 'fas fa-wpforms',
            'site-settings': 'fas fa-cog'
        };
        return icons[module] || 'fas fa-file';
    }

    getModuleGroup(module) {
        const groups = {
            'articles': 'Content',
            'products': 'Commerce',
            'gallery': 'Media',
            'forms': 'Tools',
            'site-settings': 'Settings'
        };
        return groups[module] || 'General';
    }

    async deployWorkerForSite(siteConfig) {
        // This would integrate with Cloudflare Workers API to deploy
        // For now, we'll just log the configuration needed
        console.log('Worker deployment configuration:', {
            name: siteConfig.worker_config.worker_name,
            bindings: {
                R2: siteConfig.r2_config.bucket_name,
                D1: siteConfig.d1_config.database_name
            },
            routes: siteConfig.worker_config.routes
        });
        
        // In a full implementation, this would:
        // 1. Create worker script with proper bindings
        // 2. Deploy to Cloudflare
        // 3. Setup routes
        
        return { deployed: true, worker_url: `https://${siteConfig.worker_config.worker_name}.chris-14d.workers.dev` };
    }

    async setupDomainRouting(siteConfig) {
        const { cloudflare_config, worker_config } = siteConfig;
        
        for (const route of worker_config.routes) {
            const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${route.zone_id}/workers/routes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudflare_config.api_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pattern: route.pattern,
                    script: worker_config.worker_name
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`Failed to setup route ${route.pattern}:`, error);
            }
        }
    }

    async cleanupFailedSite(siteId, accountId, apiToken) {
        try {
            // Delete R2 bucket if created
            await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${siteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });

            // Delete D1 database if created
            // (Note: D1 deletion might need the database ID)
            
            console.log(`Cleaned up failed site: ${siteId}`);
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }

    async updateSiteConfig(siteId, updates) {
        const configObject = await this.r2.get('sites-config.json');
        const config = await configObject.json();
        
        const siteIndex = config.sites.findIndex(site => site.site_id === siteId);
        if (siteIndex !== -1) {
            config.sites[siteIndex] = { ...config.sites[siteIndex], ...updates };
            
            const httpMetadata = { contentType: 'application/json' };
            await this.r2.put('sites-config.json', JSON.stringify(config, null, 2), { httpMetadata });
        }
    }
}


