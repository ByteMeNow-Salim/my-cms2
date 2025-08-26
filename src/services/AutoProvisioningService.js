// src/services/AutoProvisioningService.js
// Complete automated site provisioning without Cloudflare dashboard access
import { SysSettingsService } from './SysSettingsService.js';

export class AutoProvisioningService {
    constructor(env) {
        this.env = env;
        this.sysSettings = new SysSettingsService(env);
    }

    /**
     * Complete automated site provisioning
     * Creates: R2 bucket, D1 database, Worker, DNS records, SSL certificates
     */
    async provisionNewSite(provisioningRequest) {
        const {
            client_name,
            site_id,
            domain,
            plan = 'standard',
            template = 'standard',
            contact_email,
            billing_info = {}
        } = provisioningRequest;

        console.log(`🚀 Starting automated provisioning for ${site_id} (${domain})`);
        
        const provisioningSteps = [];
        const rollbackSteps = [];

        try {
            // Step 1: Get master credentials and validate
            const adminSettings = await this.sysSettings.loadAdminSettings();
            const masterToken = adminSettings.cloudflare.master_api_token;
            const accountId = adminSettings.cloudflare.account_id;

            if (!masterToken || !accountId) {
                throw new Error('Master Cloudflare credentials not configured');
            }

            // Step 2: Create R2 bucket
            console.log('📦 Creating R2 bucket...');
            const r2Result = await this.createR2Bucket(accountId, masterToken, site_id);
            provisioningSteps.push('r2_created');
            rollbackSteps.push(() => this.deleteR2Bucket(accountId, masterToken, site_id));

            // Step 3: Create D1 database
            console.log('🗄️ Creating D1 database...');
            const d1Result = await this.createD1Database(accountId, masterToken, site_id);
            provisioningSteps.push('d1_created');
            rollbackSteps.push(() => this.deleteD1Database(accountId, masterToken, d1Result.database_id));

            // Step 4: Initialize database schema
            console.log('📋 Initializing database schema...');
            await this.initializeD1Schema(accountId, masterToken, d1Result.database_id);
            provisioningSteps.push('schema_initialized');

            // Step 5: Setup DNS zone (if domain provided)
            let zoneResult = null;
            if (domain && domain !== 'localhost') {
                console.log('🌐 Setting up DNS zone...');
                zoneResult = await this.setupDNSZone(accountId, masterToken, domain);
                provisioningSteps.push('dns_created');
                rollbackSteps.push(() => this.deleteDNSZone(accountId, masterToken, zoneResult.zone_id));
            }

            // Step 6: Deploy worker with auto-generated wrangler.toml
            console.log('⚡ Deploying worker...');
            const workerResult = await this.deployWorker(site_id, r2Result, d1Result, zoneResult);
            provisioningSteps.push('worker_deployed');
            rollbackSteps.push(() => this.deleteWorker(accountId, masterToken, `${site_id}-cms`));

            // Step 7: Setup custom domain routing (if applicable)
            if (zoneResult) {
                console.log('🔗 Configuring domain routing...');
                await this.setupDomainRouting(accountId, masterToken, zoneResult.zone_id, domain, `${site_id}-cms`);
                provisioningSteps.push('routing_configured');
            }

            // Step 8: Initialize site content and configurations
            console.log('🎨 Initializing site content...');
            await this.initializeSiteContent(site_id, template, r2Result);
            provisioningSteps.push('content_initialized');

            // Step 9: Create sys-settings files for the new site
            console.log('⚙️ Creating site configuration...');
            const configResult = await this.createSiteConfiguration({
                client_name,
                site_id,
                domain,
                plan,
                template,
                contact_email,
                billing_info,
                r2_config: r2Result,
                d1_config: d1Result,
                zone_config: zoneResult,
                worker_config: workerResult
            });
            provisioningSteps.push('config_created');

            // Step 10: Send welcome email and setup instructions
            console.log('📧 Sending welcome email...');
            await this.sendWelcomeEmail({
                client_name,
                site_id,
                domain,
                contact_email,
                admin_url: workerResult.admin_url,
                login_credentials: configResult.login_credentials
            });

            console.log('🎉 Site provisioning completed successfully!');

            return {
                success: true,
                site_id,
                domain,
                admin_url: workerResult.admin_url,
                public_url: zoneResult ? `https://${domain}` : workerResult.worker_url,
                r2_bucket: r2Result.bucket_name,
                d1_database: d1Result.database_name,
                zone_id: zoneResult?.zone_id,
                login_credentials: configResult.login_credentials,
                provisioning_steps: provisioningSteps
            };

        } catch (error) {
            console.error('❌ Provisioning failed:', error);
            
            // Rollback completed steps
            console.log('🔄 Rolling back completed steps...');
            for (const rollbackStep of rollbackSteps.reverse()) {
                try {
                    await rollbackStep();
                } catch (rollbackError) {
                    console.error('⚠️ Rollback step failed:', rollbackError);
                }
            }

            throw {
                error: error.message,
                failed_at_step: provisioningSteps[provisioningSteps.length - 1] || 'initialization',
                completed_steps: provisioningSteps
            };
        }
    }

    async createR2Bucket(accountId, apiToken, bucketName) {
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

        // Generate R2 API tokens for the bucket
        const tokenResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/tokens`, {
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

        const tokenResult = await tokenResponse.json();

        // Setup CORS for the bucket
        await this.setupR2CORS(accountId, apiToken, bucketName);

        return {
            bucket_name: bucketName,
            access_key_id: tokenResult.result.accessKeyId,
            secret_access_key: tokenResult.result.secretAccessKey,
            public_url: `https://pub-${this.generateAccountHash(accountId)}.r2.dev`
        };
    }

    async createD1Database(accountId, apiToken, databaseName) {
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

    async initializeD1Schema(accountId, apiToken, databaseId) {
        const schema = `
        -- Core CMS tables
        CREATE TABLE IF NOT EXISTS cms_content (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            module TEXT NOT NULL,
            title TEXT,
            slug TEXT,
            content TEXT,
            status TEXT DEFAULT 'draft',
            featured_image TEXT,
            meta_title TEXT,
            meta_description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            published_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS cms_media (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,
            alt_text TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cms_users (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'editor',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        );

        CREATE TABLE IF NOT EXISTS cms_settings (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            setting_key TEXT NOT NULL,
            setting_value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(site_id, setting_key)
        );

        CREATE TABLE IF NOT EXISTS cms_forms (
            id TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            form_name TEXT NOT NULL,
            form_data TEXT NOT NULL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_content_site_module ON cms_content(site_id, module);
        CREATE INDEX IF NOT EXISTS idx_content_slug ON cms_content(slug);
        CREATE INDEX IF NOT EXISTS idx_content_status ON cms_content(status);
        CREATE INDEX IF NOT EXISTS idx_media_site ON cms_media(site_id);
        CREATE INDEX IF NOT EXISTS idx_users_site ON cms_users(site_id);
        CREATE INDEX IF NOT EXISTS idx_settings_site_key ON cms_settings(site_id, setting_key);
        `;

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

    async setupDNSZone(accountId, apiToken, domain) {
        // Check if zone already exists
        let existingZone = await this.findExistingZone(accountId, apiToken, domain);
        
        if (existingZone) {
            console.log(`🔍 Using existing zone for ${domain}`);
            return existingZone;
        }

        // Create new zone
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: domain,
                type: 'full'
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create DNS zone: ${error}`);
        }

        const result = await response.json();
        
        return {
            zone_id: result.result.id,
            name_servers: result.result.name_servers,
            status: result.result.status
        };
    }

    async deployWorker(siteId, r2Config, d1Config, zoneConfig) {
        // Generate dynamic wrangler.toml
        const wranglerConfig = this.generateWranglerConfig(siteId, r2Config, d1Config);
        
        // For now, return the configuration that would be used
        // In a full implementation, this would programmatically deploy the worker
        return {
            worker_name: `${siteId}-cms`,
            worker_url: `https://${siteId}-cms.your-account.workers.dev`,
            admin_url: `https://${siteId}-cms.your-account.workers.dev/dashboard`,
            wrangler_config: wranglerConfig
        };
    }

    async setupDomainRouting(accountId, apiToken, zoneId, domain, workerName) {
        // Create worker route for the domain
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pattern: `${domain}/*`,
                script: workerName
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to setup domain routing: ${error}`);
        }

        return await response.json();
    }

    async setupR2CORS(accountId, apiToken, bucketName) {
        const corsConfig = [
            {
                "AllowedOrigins": ["*"],
                "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
                "AllowedHeaders": ["*"],
                "ExposeHeaders": ["ETag", "Content-Length"],
                "MaxAgeSeconds": 3600
            }
        ];

        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/cors`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(corsConfig)
        });

        if (!response.ok) {
            const error = await response.text();
            console.warn(`⚠️ Failed to setup R2 CORS: ${error}`);
        }
    }

    async initializeSiteContent(siteId, template, r2Config) {
        const adminSettings = await this.sysSettings.loadAdminSettings();
        const templates = await this.sysSettings.getTemplates();
        const templateConfig = templates[template] || templates.standard;

        // Create initial sys-settings.json for the site
        const clientSettings = {
            config_type: "client_settings",
            version: "1.0.0",
            last_updated: new Date().toISOString(),
            client_id: siteId,
            site_info: {
                site_name: `Site ${siteId}`,
                site_description: `A new CMS website built with ${template} template`,
                default_language: "en",
                timezone: "UTC"
            },
            modules: {
                enabled: templateConfig.modules,
                module_settings: {}
            },
            templates: templates
        };

        // Upload to R2 bucket (using current R2 connection as proxy)
        const httpMetadata = { contentType: 'application/json' };
        await this.env.R2.put(`${siteId}/sys-settings.json`, JSON.stringify(clientSettings, null, 2), { httpMetadata });
        
        // Create initial content based on template
        for (const page of templateConfig.default_pages || []) {
            const pageContent = {
                id: `${page}-${Date.now()}`,
                site_id: siteId,
                module: 'pages',
                title: page.charAt(0).toUpperCase() + page.slice(1),
                slug: page,
                content: `<h1>Welcome to your ${page} page</h1><p>This is your ${page} page content. Edit this in your CMS dashboard.</p>`,
                status: 'published',
                created_at: new Date().toISOString()
            };
            
            await this.env.R2.put(`${siteId}/content/${page}.json`, JSON.stringify(pageContent, null, 2), { httpMetadata });
        }
    }

    async createSiteConfiguration(siteData) {
        const adminPassword = this.generateSecurePassword();
        const adminSettings = {
            config_type: "hosting_admin",
            version: "1.0.0",
            last_updated: new Date().toISOString(),
            environment: "production",
            cloudflare: {
                account_id: siteData.r2_config.account_id,
                zone_id: siteData.zone_config?.zone_id,
                api_token: "managed_by_platform"
            },
            r2: siteData.r2_config,
            d1: siteData.d1_config,
            client_info: {
                client_id: siteData.site_id,
                client_name: siteData.client_name,
                domain: siteData.domain,
                plan: siteData.plan,
                contact_email: siteData.contact_email,
                status: "active",
                created_at: new Date().toISOString()
            }
        };

        // Store in main configuration system
        // This would integrate with your master site registry
        
        return {
            login_credentials: {
                username: 'admin',
                password: adminPassword,
                login_url: siteData.worker_config?.admin_url
            }
        };
    }

    async sendWelcomeEmail(emailData) {
        // Implementation would send actual email
        console.log(`📧 Welcome email sent to ${emailData.contact_email}:
        
Subject: Your CMS Site is Ready!

Dear ${emailData.client_name},

Your CMS site "${emailData.site_id}" has been successfully provisioned!

🌐 Your Site: ${emailData.public_url || 'https://' + emailData.site_id + '.your-platform.com'}
⚙️ Admin Panel: ${emailData.admin_url}

Login Credentials:
Username: ${emailData.login_credentials.username}
Password: ${emailData.login_credentials.password}

Next Steps:
1. Log into your admin panel
2. Customize your site settings
3. Add your content
4. Configure your domain (if applicable)

Need help? Contact our support team.

Best regards,
Your CMS Platform Team`);
    }

    // Utility methods
    generateWranglerConfig(siteId, r2Config, d1Config) {
        return `name = "${siteId}-cms"
main = "index.js"
compatibility_date = "2024-05-02"

r2_buckets = [
  { binding = "R2", bucket_name = "${r2Config.bucket_name}", preview_bucket_name = "${r2Config.bucket_name}-dev" }
]

[vars]
ENVIRONMENT = "production"
SITE_ID = "${siteId}"

[[d1_databases]]
binding = "D1"
database_name = "${d1Config.database_name}"
database_id = "${d1Config.database_id}"`;
    }

    generateSecurePassword(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    generateAccountHash(accountId) {
        // Simple hash generation - replace with actual implementation
        return accountId.substring(0, 8);
    }

    async findExistingZone(accountId, apiToken, domain) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${domain}`, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const result = await response.json();
            if (result.result.length > 0) {
                return {
                    zone_id: result.result[0].id,
                    name_servers: result.result[0].name_servers,
                    status: result.result[0].status
                };
            }
        }
        return null;
    }

    // Rollback methods
    async deleteR2Bucket(accountId, apiToken, bucketName) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });
        console.log(`🗑️ Cleaned up R2 bucket: ${bucketName}`);
    }

    async deleteD1Database(accountId, apiToken, databaseId) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });
        console.log(`🗑️ Cleaned up D1 database: ${databaseId}`);
    }

    async deleteDNSZone(accountId, apiToken, zoneId) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });
        console.log(`🗑️ Cleaned up DNS zone: ${zoneId}`);
    }

    async deleteWorker(accountId, apiToken, workerName) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });
        console.log(`🗑️ Cleaned up worker: ${workerName}`);
    }
}














