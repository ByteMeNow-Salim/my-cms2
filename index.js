// index.js
import { DashboardService } from './src/services/DashboardService.js';
import { CRUDService } from './src/services/CRUDService.js';
import { ViewService } from './src/services/ViewService.js';
import { SiteProvisioningService } from './src/services/SiteProvisioningService.js';
import { SysSettingsService } from './src/services/SysSettingsService.js';
import { AutoProvisioningService } from './src/services/AutoProvisioningService.js';
import { ProvisioningDashboardService } from './src/services/ProvisioningDashboardService.js';

import { TempIndexRead } from './src/hooks/TempIndexRead.js';

export default {
  async fetch(request, env) {
    console.log("--- NEW REQUEST ---");
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    console.log(`🌐 Request URL: ${request.url}`);
    console.log(`📍 Path parts:`, pathParts);
    console.log(`🔢 Path parts length: ${pathParts.length}`);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Serve CSS
    if (url.pathname === '/sys-dashboard.css') {
      const object = await env.R2.get('sys-dashboard.css');
      if (object === null) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(object.body, { headers: { 'Content-Type': 'text/css' } });
    }

// zaid: begin: temp code

if (url.pathname === '/template-133') {
    return TempIndexRead(request, env);
  }
  
// zaid: end: temp code
  

    // Handle favicon.ico requests
    if (url.pathname === '/favicon.ico') {
      const object = await env.R2.get('favicon.ico');
      if (object === null) {
        // Return a simple 1x1 transparent pixel if favicon not found
        const transparentPixel = new Uint8Array([
          0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
          0xFF, 0xFF, 0xFF, 0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x04, 0x01, 0x00, 0x3B
        ]);
        return new Response(transparentPixel, { 
          headers: { 
            'Content-Type': 'image/x-icon',
            'Cache-Control': 'public, max-age=86400' // Cache for 1 day
          } 
        });
      }
      return new Response(object.body, { 
        headers: { 
          'Content-Type': 'image/x-icon',
          'Cache-Control': 'public, max-age=86400' // Cache for 1 day
        } 
      });
    }

    // Serve service worker with proper headers
    if (url.pathname === '/sw.js') {
      const object = await env.R2.get('sw.js');
      if (object === null) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(object.body, { 
        headers: { 
          'Content-Type': 'application/javascript',
          'Service-Worker-Allowed': '/',
          'Cache-Control': 'public, max-age=0' // Always check for updates
        } 
      });
    }

    // Serve .js, .css, .html files directly from R2
    if (url.pathname.match(/\.(json|js|css|html)$/i)) {
      const filename = url.pathname.substring(1); // Remove leading slash
      const object = await env.R2.get(filename);
      if (object === null) {
        return new Response('Not Found', { status: 404 });
      }

      // Content type mapping
      const ext = filename.split('.').pop().toLowerCase();
      const contentTypeMap = {
        js: 'application/javascript',
        css: 'text/css',
        html: 'text/html',
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      return new Response(object.body, { 
        headers: { 
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000' // Cache static assets for 1 year
        } 
      });
    }

    // Serve JavaScript files from R2 (with caching)
    if (url.pathname.match(/\.js$/i)) {
      const filename = url.pathname.substring(1); // Remove leading slash
      const object = await env.R2.get(filename);
      if (object === null) {
        return new Response('Module not found: ' + filename, { status: 404 });
      }
      return new Response(object.body, { 
        headers: { 
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
        } 
      });
    }

    // Debug endpoint to invalidate system forms cache
    if (url.pathname === '/api/debug/invalidate-cache') {
      CRUDService.invalidateSystemFormsCache();
      return new Response('System forms cache invalidated', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // Debug endpoint to check system forms
    if (url.pathname === '/api/debug/system-forms') {
      const crudService = new CRUDService(env.R2, env.D1, env.ENVIRONMENT);
      const systemForms = await crudService.getSystemForms();
      return new Response(JSON.stringify({
        type: typeof systemForms,
        isArray: Array.isArray(systemForms),
        length: Array.isArray(systemForms) ? systemForms.length : 'N/A',
        data: systemForms
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Debug endpoint to list R2 files
    if (url.pathname === '/api/debug/r2-files') {
      try {
        const objects = await env.R2.list({ limit: 50 });
        const files = objects.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          httpMetadata: obj.httpMetadata
        }));
        return new Response(JSON.stringify({ files, truncated: objects.truncated }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Serve settings.json for client-side configuration (BACKWARD COMPATIBLE)
    if (url.pathname === '/api/settings') {
      const sysSettings = new SysSettingsService(env);
      try {
        const imageSettings = await sysSettings.getImageSettings();
        return new Response(JSON.stringify(imageSettings), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        console.error('Settings API error:', error);
        return new Response('Settings not found', { status: 404 });
      }
    }

    // NEW API - Full client settings
    if (url.pathname === '/api/sys-settings') {
      const sysSettings = new SysSettingsService(env);
      
      if (request.method === 'GET') {
        try {
          const clientSettings = await sysSettings.loadClientSettings();
          return new Response(JSON.stringify(clientSettings), {
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Client settings not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (request.method === 'PUT') {
        try {
          const updates = await request.json();
          const updatedSettings = await sysSettings.updateClientSettings(updates);
          return new Response(JSON.stringify({ 
            success: true, 
            settings: updatedSettings 
          }), {
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // ADMIN API - Hosting provider only
    if (url.pathname === '/api/sys-settings-admin') {
      const sysSettings = new SysSettingsService(env);
      const adminKey = request.headers.get('X-Admin-Key');
      
      if (!adminKey) {
        return new Response('Unauthorized: Admin key required', { status: 401 });
      }

      if (request.method === 'GET') {
        try {
          const adminSettings = await sysSettings.loadAdminSettings();
          
          // Verify admin access
          if (!adminSettings.security?.admin_api_keys?.includes(adminKey)) {
            return new Response('Unauthorized: Invalid admin key', { status: 401 });
          }

          return new Response(JSON.stringify(adminSettings), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response('Internal Server Error', { status: 500 });
        }
      }

      if (request.method === 'PUT') {
        try {
          const updates = await request.json();
          const updatedSettings = await sysSettings.updateAdminSettings(updates, adminKey);
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: error.message.includes('Unauthorized') ? 401 : 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // 🚀 AUTOMATED PROVISIONING ENDPOINTS
    
    // Provisioning Dashboard
    if (url.pathname === '/provisioning' || url.pathname === '/provision') {
      return await provisioningDashboard.renderProvisioningDashboard();
    }

    // API: Provision new site
    if (url.pathname === '/api/provision-site' && request.method === 'POST') {
      try {
        const provisioningRequest = await request.json();
        
        // Validate required fields
        const required = ['client_name', 'site_id', 'contact_email', 'template'];
        for (const field of required) {
          if (!provisioningRequest[field]) {
            return new Response(JSON.stringify({ 
              error: `Missing required field: ${field}` 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        // Start provisioning
        console.log('🚀 Starting automated site provisioning:', provisioningRequest);
        const result = await autoProvisioning.provisionNewSite(provisioningRequest);

        return new Response(JSON.stringify({ 
          success: true, 
          result 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('❌ Site provisioning failed:', error);
        return new Response(JSON.stringify({ 
          error: error.error || error.message,
          details: error.failed_at_step || 'unknown',
          completed_steps: error.completed_steps || []
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // API: Get provisioning status
    if (url.pathname === '/api/provisioning-status' && request.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      if (!siteId) {
        return new Response(JSON.stringify({ error: 'site_id required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        // Check if site exists and get status
        const sysSettings = new SysSettingsService(env);
        const sites = await sysSettings.getSites();
        const site = sites.find(s => s.site_id === siteId);

        if (!site) {
          return new Response(JSON.stringify({ 
            exists: false, 
            status: 'not_found' 
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ 
          exists: true, 
          status: site.status,
          site_info: {
            site_id: site.site_id,
            domain: site.domain,
            created_at: site.created_at,
            admin_url: `https://${site.worker_config?.worker_name}.workers.dev/dashboard`
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: 'Failed to check status',
          details: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // API: List all provisioned sites (admin only)
    if (url.pathname === '/api/provisioned-sites' && request.method === 'GET') {
      const adminKey = request.headers.get('X-Admin-Key');
      
      if (!adminKey) {
        return new Response('Unauthorized: Admin key required', { status: 401 });
      }

      try {
        const sysSettings = new SysSettingsService(env);
        const adminSettings = await sysSettings.loadAdminSettings();
        
        if (!adminSettings.security?.admin_api_keys?.includes(adminKey)) {
          return new Response('Unauthorized: Invalid admin key', { status: 401 });
        }

        const sites = await sysSettings.getSites();
        
        return new Response(JSON.stringify({ 
          total_sites: sites.length,
          sites: sites.map(site => ({
            site_id: site.site_id,
            site_name: site.site_name,
            domain: site.domain,
            status: site.status,
            created_at: site.created_at,
            admin_url: `https://${site.worker_config?.worker_name}.workers.dev/dashboard`
          }))
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: 'Failed to list sites',
          details: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Serve uploaded images from R2
    if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      const filename = url.pathname.substring(1); // Remove leading slash
      const object = await env.R2.get(filename);
      if (object === null) {
        return new Response('Image not found', { status: 404 });
      }
      
      // Get the content type from the file extension
      const ext = filename.split('.').pop().toLowerCase();
      const contentTypeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml'
      };
      
      const contentType = contentTypeMap[ext] || 'image/jpeg';
      
      return new Response(object.body, { 
        headers: { 
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
        } 
      });
    }

    // Dashboard Route
    const dashboardService = new DashboardService(env.R2);
    if (url.pathname === '/dashboard' || url.pathname === '/') {
      return dashboardService.renderDashboard(request);
    }
    
    const crudService = new CRUDService(env);
    const viewService = new ViewService(env);
    const provisioningService = new SiteProvisioningService(env);
    const autoProvisioning = new AutoProvisioningService(env);
    const provisioningDashboard = new ProvisioningDashboardService(env);

    // API Route for setting up CORS configuration
    if (url.pathname === '/api/setup-cors' && request.method === 'POST') {
      try {
        await crudService.setupCORS();
        return new Response(JSON.stringify({ success: true, message: 'CORS configured successfully' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error setting up CORS:', error.message);
        return new Response(JSON.stringify({ error: 'Failed to setup CORS', details: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // API Route for creating new sites (AUTOMATED)
    if (url.pathname === '/api/create-site' && request.method === 'POST') {
      try {
        const siteData = await request.json();
        
        // Validate required fields
        if (!siteData.site_id || !siteData.site_name || !siteData.domain) {
          throw new Error('Missing required fields: site_id, site_name, domain');
        }

        // Use master API token from environment or config
        if (!siteData.api_token) {
          siteData.api_token = env.MASTER_API_TOKEN;
        }
        if (!siteData.cloudflare_account_id) {
          siteData.cloudflare_account_id = env.ACCOUNT_ID;
        }

        const newSite = await provisioningService.createSiteFromDashboard(siteData);

        return new Response(JSON.stringify({ 
          success: true, 
          site: newSite,
          message: 'Site created successfully!',
          access_url: `https://${newSite.worker_config.worker_name}.chris-14d.workers.dev`
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      } catch (error) {
        console.error('Error creating site:', error.message);
        return new Response(JSON.stringify({ 
          error: 'Failed to create site', 
          details: error.message 
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      }
    }

    // API Route for proxy file upload (bypasses CORS)
    if (url.pathname === '/api/upload-file' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          throw new Error('No file provided');
        }

        // Create readable filename: yyyy-mm-dd-hh-mm-ss-ms-filename.ext (URL-friendly)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        
        // Clean filename: remove spaces and special characters, keep only alphanumeric, dots, hyphens, underscores
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-_]/g, '_');
        const objectKey = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}-${ms}-${cleanFileName}`;
        const httpMetadata = { contentType: file.type };
        
        console.log(`📁 Uploading file: ${file.name} (${file.size} bytes) -> ${objectKey}`);
        
        // Upload directly to R2 via worker
        await env.R2.put(objectKey, file.stream(), { httpMetadata });
        
        const publicUrl = `https://pub-0852f3a82b534b18991316b054236b23.r2.dev/${objectKey}`;

        console.log(`✅ File uploaded successfully: ${objectKey}`);

        return new Response(JSON.stringify({ success: true, publicUrl, objectKey }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      } catch (error) {
        console.error('❌ Error uploading file:', error.message);
        return new Response(JSON.stringify({ error: 'Failed to upload file', details: error.message }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      }
    }

    // API Route for generating presigned URLs for R2 uploads (legacy)
    if (url.pathname === '/api/generate-upload-url' && request.method === 'POST') {
      try {
        const { fileName, contentType } = await request.json();
        const { uploadUrl, objectKey } = await crudService.generatePresignedUrl(fileName, contentType);
        const publicUrl = `https://pub-0852f3a82b534b18991316b054236b23.r2.dev/${objectKey}`;

        return new Response(JSON.stringify({ uploadUrl, publicUrl }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      } catch (error) {
        console.error('Error generating presigned URL:', error.message);
        return new Response(JSON.stringify({ error: 'Failed to generate presigned URL', details: error.message }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      }
    }

    // API Route for deleting images from R2
    if (url.pathname === '/api/delete-image' && request.method === 'POST') {
      try {
        const { key } = await request.json();
        if (!key) {
          throw new Error('No key provided');
        }
        
        await env.R2.delete(key);
        
        return new Response(JSON.stringify({ success: true, message: 'Image deleted successfully' }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      } catch (error) {
        console.error('Error deleting image:', error.message);
        return new Response(JSON.stringify({ error: 'Failed to delete image', details: error.message }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          },
        });
      }
    }

    // API Route for batch operations (ALL modules)
    if (url.pathname === '/api/batch-update' && request.method === 'POST') {
      try {
        const { modulePath, itemId, updates, detailOperations } = await request.json();
        
        if (!modulePath) {
          throw new Error('Missing required field: modulePath');
        }

        let result;
        if (itemId && detailOperations) {
          // Use batch operation for modules with details
          result = await crudService.updateMenuWithDetails(modulePath, itemId, updates, detailOperations || []);
        } else if (itemId) {
          // Single update operation
          await crudService.update(modulePath, itemId, updates);
          result = await crudService.get(modulePath, itemId);
        } else {
          // Create operation
          const newId = await crudService.create(modulePath, updates);
          result = await crudService.get(modulePath, newId);
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: result 
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
            'X-Performance-Optimized': 'batch-api'
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: 'Failed to process batch operation', 
          details: error.message 
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
        });
      }
    }

    // CRUD Routes
    try {
      switch (pathParts.length) {
        case 1: // e.g., /systemforms or POST /systemforms
          if (request.method === 'POST') {
            const formData = await request.formData();
            const data = {};
            
                            // Process form data including background uploaded files
                for (const [key, value] of formData.entries()) {
                  if (key.endsWith('_uploaded')) {
                    // This is a background uploaded file - use the uploaded filename
                    const originalFieldName = key.replace('_uploaded', '');
                    if (value && value.trim() !== '') {
                      data[originalFieldName] = value;
                      console.log(`📁 Using background uploaded file for ${originalFieldName}: ${value}`);
                    }
                  } else if (value instanceof File && value.size > 0) {
                    // Handle direct file upload (fallback for non-background uploads)
                    console.log(`📁 Processing direct file upload for field: ${key}, file: ${value.name}`);
                    try {
                      // Create readable filename: yyyy-mm-dd-hh-mm-ss-ms-filename.ext (URL-friendly)
                      const now = new Date();
                      const year = now.getFullYear();
                      const month = String(now.getMonth() + 1).padStart(2, '0');
                      const day = String(now.getDate()).padStart(2, '0');
                      const hours = String(now.getHours()).padStart(2, '0');
                      const minutes = String(now.getMinutes()).padStart(2, '0');
                      const seconds = String(now.getSeconds()).padStart(2, '0');
                      const ms = String(now.getMilliseconds()).padStart(3, '0');
                      
                      // Clean filename: remove spaces and special characters
                      const cleanFileName = value.name.replace(/[^a-zA-Z0-9.-_]/g, '_');
                      const objectKey = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}-${ms}-${cleanFileName}`;
                      const httpMetadata = { contentType: value.type };

                      // Upload file to R2
                      await env.R2.put(objectKey, value.stream(), { httpMetadata });
                      data[key] = objectKey;
                      console.log(`✅ File uploaded successfully: ${objectKey}`);
                    } catch (error) {
                      console.error(`❌ File upload failed for ${key}:`, error);
                      data[key] = ''; // Set empty if upload fails
                    }
                  } else {
                    // Handle regular form field (skip _uploaded fields)
                    if (!key.endsWith('_uploaded')) {
                      data[key] = value;
                    }
                  }
                }
            
            await crudService.create(pathParts[0], data);
            return Response.redirect(`${url.origin}/${pathParts[0]}`, 303);
          } else {
            const config = await crudService.getModuleConfig(pathParts[0]);
            
            // Extract pagination parameters from URL
            const page = parseInt(url.searchParams.get('page')) || 1;
            const pageSize = parseInt(url.searchParams.get('page_size')) || null;
            
            const result = await crudService.list(pathParts[0], page, pageSize);
            const response = await viewService.renderListPage(result, config, url);
            
            // Add aggressive caching headers for list pages
            return new Response(response.body, {
              status: response.status,
              headers: {
                ...Object.fromEntries(response.headers.entries()),
                'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', // 5min cache, 10min stale
                'ETag': `"${Date.now()}-${pathParts[0]}"`,
                'X-Performance-Optimized': 'true'
              }
            });
          }
          break;

        case 2: // e.g., /systemforms/new or /systemforms/181
          if (pathParts[1] === 'new') {
            console.log(`🆕 Rendering new form for module: ${pathParts[0]}`);
            const config = await crudService.getModuleConfig(pathParts[0]);
            console.log(`📋 Module config loaded:`, {
              label: config.label,
              path: config.path,
              form_definition_file: config.form_definition_file
            });
            
            // Use dynamic form generation by module label
            console.log(`🔄 Calling getFormFields with moduleLabel: "${config.label}"`);
            const formFields = await crudService.getFormFields(config.form_definition_file, null, config.label);
            console.log(`📝 Form fields received:`, formFields);
            
            const response = await viewService.renderNewPage(config, formFields);
            console.log(`✅ Rendered new page successfully`);
            
            // Add caching headers for new forms (forms don't change often)
            return new Response(response.body || response, {
              status: 200,
              headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200', // 10min cache
                'ETag': `"form-${pathParts[0]}-${Date.now()}"`,
                'X-Performance-Optimized': 'true'
              }
            });
          } else {
            const item = await crudService.get(pathParts[0], pathParts[1]);
            return new Response(JSON.stringify(item, null, 2), { headers: { 'Content-Type': 'application/json' } });
          }
          break;

        case 3: // e.g., /systemforms/181/delete
          if (pathParts[2] === 'edit') {
            if (request.method === 'POST') {
              const formData = await request.formData();
              const updates = {};
              
              // Process form data including background uploaded files
              for (const [key, value] of formData.entries()) {
                if (key.endsWith('_uploaded')) {
                  // This is a background uploaded file - use the uploaded filename
                  const originalFieldName = key.replace('_uploaded', '');
                  if (value && value.trim() !== '') {
                    updates[originalFieldName] = value;
                    console.log(`📁 Using background uploaded file for ${originalFieldName}: ${value}`);
                  }
                } else if (value instanceof File && value.size > 0) {
                  // Handle direct file upload (fallback for non-background uploads)
                  console.log(`📁 Processing direct file upload for field: ${key}, file: ${value.name}`);
                  try {
                    // Create readable filename: yyyy-mm-dd-hh-mm-ss-ms-filename.ext
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const seconds = String(now.getSeconds()).padStart(2, '0');
                    const ms = String(now.getMilliseconds()).padStart(3, '0');
                    const objectKey = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}-${ms}-${value.name}`;
                    const httpMetadata = { contentType: value.type };
                    
                    // Upload file to R2
                    await env.R2.put(objectKey, value.stream(), { httpMetadata });
                    updates[key] = objectKey;
                    console.log(`✅ File uploaded successfully: ${objectKey}`);
                  } catch (error) {
                    console.error(`❌ File upload failed for ${key}:`, error);
                    updates[key] = ''; // Set empty if upload fails
                  }
                } else {
                  // Handle regular form field (skip _uploaded fields)
                  if (!key.endsWith('_uploaded')) {
                    updates[key] = value;
                  }
                }
              }
              
              await crudService.update(pathParts[0], pathParts[1], updates);
              return Response.redirect(`${url.origin}/${pathParts[0]}`, 303);
            } else {
              const config = await crudService.getModuleConfig(pathParts[0]);
              const item = await crudService.get(pathParts[0], pathParts[1]);
              // Use dynamic form generation by module label
              const formFields = await crudService.getFormFields(config.form_definition_file, null, config.label);
              const htmlContent = await viewService.renderEditPage(item, config, formFields);
              return new Response(htmlContent, {
                headers: {
                  'Content-Type': 'text/html',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'X-Modern-Interface': 'active'
                }
              });
            }
          } else if (pathParts[2] === 'details') {
            const config = await crudService.getModuleConfig(pathParts[0]);
            const item = await crudService.get(pathParts[0], pathParts[1]);
            return viewService.renderDetailsPage(item, config);
          } else if (pathParts[2] === 'delete') {
            if (request.method === 'POST') {
              // Get record data to find image files before deleting
              try {
                const recordData = await crudService.get(pathParts[0], pathParts[1]);
                
                // Find and delete image files from R2
                if (recordData) {
                  const imageFields = [];
                  for (const [key, value] of Object.entries(recordData)) {
                    if (value && typeof value === 'string') {
                      // Check if it looks like an image filename (contains date pattern and image extension)
                      if (value.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-.+\.(jpg|jpeg|png|gif|webp)$/i)) {
                        imageFields.push(value);
                      }
                    }
                  }
                  
                  // Delete images from R2
                  for (const imageFile of imageFields) {
                    try {
                      await env.R2.delete(imageFile);
                      console.log(`🗑️ Deleted image from R2: ${imageFile}`);
                    } catch (error) {
                      console.error(`❌ Failed to delete image from R2: ${imageFile}`, error);
                    }
                  }
                }
              } catch (error) {
                console.error('❌ Error getting record data for image cleanup:', error);
              }
              
              await crudService.delete(pathParts[0], pathParts[1]);
              return Response.redirect(`${url.origin}/${pathParts[0]}`, 303);
            } else {
              const config = await crudService.getModuleConfig(pathParts[0]);
              return viewService.renderDeleteConfirmationPage(pathParts[0], pathParts[1], config);
            }
          }
          break;

        case 4: // e.g., /systemforms/15/details/new
          if (pathParts[2] === 'details' && pathParts[3] === 'new') {
            const [modulePath, itemId] = pathParts;
            if (request.method === 'POST') {
              const formData = await request.formData();
              const detailData = Object.fromEntries(formData.entries());
              await crudService.createDetail(modulePath, itemId, detailData);
              
              // Redirect to detail page after creating
              return Response.redirect(`${url.origin}/${modulePath}/${itemId}/details`, 303);
            } else {
              const config = await crudService.getModuleConfig(modulePath);
              const item = await crudService.get(modulePath, itemId);
              // Use dynamic form generation by module label for details
              const formFields = await crudService.getFormFields(config.detail_form_definition_file, null, config.label, true);
              return await viewService.renderNewDetailPage(item, config, formFields);
            }
          }
          break;

        case 5: // e.g., /systemforms/33/details/149/edit
          if (pathParts[2] === 'details' && pathParts[4] === 'edit') {
            if (request.method === 'POST') {
              const formData = await request.formData();
              const updates = Object.fromEntries(formData.entries());
              await crudService.updateDetail(pathParts[0], pathParts[1], pathParts[3], updates);
              
              // Redirect to detail page after updating
              return Response.redirect(`${url.origin}/${pathParts[0]}/${pathParts[1]}/details`, 303);
            } else {
              const config = await crudService.getModuleConfig(pathParts[0]);
              const item = await crudService.get(pathParts[0], pathParts[1]);
              const detailIdField = config.detail_id_field || 'form_detail_id';
              const detail = item.details.find(d => d[detailIdField] == pathParts[3]);
              // Use dynamic form generation by module label for detail editing
              const formFields = await crudService.getFormFields(config.detail_form_definition_file, null, config.label, true);
              return await viewService.renderDetailEditPage(item, detail, config, formFields);
            }
          } else if (pathParts[2] === 'details' && pathParts[4] === 'delete') {
            if (request.method === 'POST') {
              // Get detail record data to find image files before deleting
              try {
                const detailData = await crudService.getDetail(pathParts[0], pathParts[1], pathParts[3]);
                
                // Find and delete image files from R2
                if (detailData) {
                  const imageFields = [];
                  for (const [key, value] of Object.entries(detailData)) {
                    if (value && typeof value === 'string') {
                      // Check if it looks like an image filename (contains date pattern and image extension)
                      if (value.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-.+\.(jpg|jpeg|png|gif|webp)$/i)) {
                        imageFields.push(value);
                      }
                    }
                  }
                  
                  // Delete images from R2
                  for (const imageFile of imageFields) {
                    try {
                      await env.R2.delete(imageFile);
                      console.log(`🗑️ Deleted detail image from R2: ${imageFile}`);
                    } catch (error) {
                      console.error(`❌ Failed to delete detail image from R2: ${imageFile}`, error);
                    }
                  }
                }
              } catch (error) {
                console.error('❌ Error getting detail record data for image cleanup:', error);
              }
              
              await crudService.deleteDetail(pathParts[0], pathParts[1], pathParts[3]);
              
              // Redirect to detail page after deleting
              return Response.redirect(`${url.origin}/${pathParts[0]}/${pathParts[1]}/details`, 303);
            } else {
              const config = await crudService.getModuleConfig(pathParts[0]);
              return viewService.renderDetailDeleteConfirmationPage(pathParts[0], pathParts[1], pathParts[3], config);
            }
          }
          break;
      }
    } catch (error) {
      console.error('CRUD operation error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error', 
        message: error.message,
        path: url.pathname
      }), { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // API endpoints for modal functionality
    if (url.pathname.startsWith('/api/form-definition/')) {
      const modulePath = url.pathname.replace('/api/form-definition/', '');
      const config = await crudService.getModuleConfig(modulePath);
      // Use dynamic form generation by module label
      const formFields = await crudService.getFormFields(config.form_definition_file, null, config.label);
      return new Response(JSON.stringify(formFields), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname.startsWith('/api/data/')) {
      const pathParts = url.pathname.replace('/api/data/', '').split('/');
      const [modulePath, itemId] = pathParts;
      const item = await crudService.get(modulePath, itemId);
      return new Response(JSON.stringify(item), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname.startsWith('/api/module-config/')) {
      const modulePath = url.pathname.replace('/api/module-config/', '');
      const config = await crudService.getModuleConfig(modulePath);
      return new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname.startsWith('/api/form-definition-file/')) {
      const fileName = url.pathname.replace('/api/form-definition-file/', '');
      console.log('Form definition file requested:', fileName);
      try {
        // For dynamic forms, try to get by module label first, then fallback to file
        const formFields = await crudService.getFormFields(fileName);
        console.log('Form fields loaded:', formFields ? 'success' : 'null');
        if (!formFields) {
          return new Response(JSON.stringify({error: 'Form definition not found'}), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(formFields), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error loading form definition:', error);
        return new Response(JSON.stringify({error: error.message}), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
