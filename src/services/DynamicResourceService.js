// src/services/DynamicResourceService.js
import { SysSettingsService } from './SysSettingsService.js';

export class DynamicResourceService {
    constructor(env) {
        this.env = env;
        this.sysSettings = new SysSettingsService(env);
        this.r2Client = null;
        this.d1Client = null;
    }

    // Get R2 client - uses binding if available, otherwise creates dynamic connection
    async getR2Client() {
        // Try using the bound R2 first (fastest)
        if (this.env.R2) {
            return this.env.R2;
        }

        // Fallback: Create dynamic R2 connection using credentials from config
        if (!this.r2Client) {
            try {
                const adminSettings = await this.sysSettings.loadAdminSettings();
                const r2Config = adminSettings.r2;
                
                // Note: Direct R2 access requires AWS SDK and endpoint configuration
                // This is more complex but gives complete flexibility
                const { S3Client } = await import('@aws-sdk/client-s3');
                
                this.r2Client = new S3Client({
                    region: 'auto',
                    endpoint: `https://${adminSettings.cloudflare.account_id}.r2.cloudflarestorage.com`,
                    credentials: {
                        accessKeyId: r2Config.access_key_id,
                        secretAccessKey: r2Config.secret_access_key,
                    },
                });
                
                console.log('🔄 Created dynamic R2 connection');
            } catch (error) {
                console.error('❌ Failed to create dynamic R2 connection:', error);
                throw error;
            }
        }
        
        return this.r2Client;
    }

    // Get D1 client - uses binding if available, otherwise creates API connection
    async getD1Client() {
        // Try using the bound D1 first (fastest)
        if (this.env.D1) {
            return this.env.D1;
        }

        // Fallback: Use D1 HTTP API with credentials from config
        if (!this.d1Client) {
            try {
                const adminSettings = await this.sysSettings.loadAdminSettings();
                const d1Config = adminSettings.d1;
                const cloudflareConfig = adminSettings.cloudflare;
                
                // Create D1 HTTP API client
                this.d1Client = {
                    async prepare(query) {
                        return {
                            async all() {
                                const response = await fetch(
                                    `https://api.cloudflare.com/client/v4/accounts/${cloudflareConfig.account_id}/d1/database/${d1Config.database_id}/query`,
                                    {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${cloudflareConfig.master_api_token}`,
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({ sql: query }),
                                    }
                                );
                                
                                if (!response.ok) {
                                    throw new Error(`D1 API error: ${response.statusText}`);
                                }
                                
                                const result = await response.json();
                                return result.result[0]?.results || [];
                            },
                            
                            async run() {
                                const response = await fetch(
                                    `https://api.cloudflare.com/client/v4/accounts/${cloudflareConfig.account_id}/d1/database/${d1Config.database_id}/query`,
                                    {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${cloudflareConfig.master_api_token}`,
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({ sql: query }),
                                    }
                                );
                                
                                if (!response.ok) {
                                    throw new Error(`D1 API error: ${response.statusText}`);
                                }
                                
                                const result = await response.json();
                                return result.result[0];
                            }
                        };
                    }
                };
                
                console.log('🔄 Created dynamic D1 connection');
            } catch (error) {
                console.error('❌ Failed to create dynamic D1 connection:', error);
                throw error;
            }
        }
        
        return this.d1Client;
    }

    // Get bucket name from config
    async getBucketName() {
        const adminSettings = await this.sysSettings.loadAdminSettings();
        return adminSettings.r2.bucket_name;
    }

    // Get database name from config
    async getDatabaseName() {
        const adminSettings = await this.sysSettings.loadAdminSettings();
        return adminSettings.d1.database_name;
    }
}














