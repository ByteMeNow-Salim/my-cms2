// src/services/ProvisioningDashboardService.js
// Dashboard interface for automated site provisioning
import { AutoProvisioningService } from './AutoProvisioningService.js';
import { SysSettingsService } from './SysSettingsService.js';

export class ProvisioningDashboardService {
    constructor(env) {
        this.env = env;
        this.autoProvisioning = new AutoProvisioningService(env);
        this.sysSettings = new SysSettingsService(env);
    }

    async renderProvisioningDashboard() {
        const adminSettings = await this.sysSettings.loadAdminSettings();
        const stats = await this.getProvisioningStats();

        return new Response(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CMS Provisioning Platform</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; }
                    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }
                    .header h1 { font-size: 2.5em; margin-bottom: 10px; }
                    .header p { font-size: 1.2em; opacity: 0.9; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
                    .stat-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
                    .stat-number { font-size: 2.5em; font-weight: bold; color: #667eea; margin-bottom: 10px; }
                    .stat-label { color: #666; font-size: 1.1em; }
                    .main-content { display: grid; grid-template-columns: 1fr 400px; gap: 30px; }
                    .provision-form { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .form-group { margin-bottom: 20px; }
                    .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
                    .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 12px; border: 2px solid #e1e5e9; border-radius: 8px; font-size: 16px; }
                    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #667eea; }
                    .btn-primary { background: #667eea; color: white; padding: 15px 30px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%; }
                    .btn-primary:hover { background: #5a6fd8; }
                    .sidebar { display: flex; flex-direction: column; gap: 20px; }
                    .info-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .info-card h3 { color: #333; margin-bottom: 15px; }
                    .feature-list { list-style: none; }
                    .feature-list li { padding: 8px 0; border-bottom: 1px solid #eee; }
                    .feature-list li:last-child { border-bottom: none; }
                    .feature-list li::before { content: '✅'; margin-right: 10px; }
                    .pricing-table { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .plan { padding: 15px; margin: 10px 0; border: 2px solid #e1e5e9; border-radius: 8px; cursor: pointer; }
                    .plan.selected { border-color: #667eea; background: #f8f9ff; }
                    .plan-name { font-weight: bold; color: #333; }
                    .plan-price { font-size: 1.5em; color: #667eea; font-weight: bold; }
                    .plan-features { font-size: 0.9em; color: #666; margin-top: 5px; }
                    .progress { display: none; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .progress-step { padding: 15px; margin: 10px 0; border-radius: 8px; background: #f8f9fa; border-left: 4px solid #ddd; }
                    .progress-step.active { border-left-color: #007bff; background: #e7f3ff; }
                    .progress-step.completed { border-left-color: #28a745; background: #e8f5e8; }
                    .progress-step.error { border-left-color: #dc3545; background: #ffeaea; }
                    @media (max-width: 768px) {
                        .main-content { grid-template-columns: 1fr; }
                        .stats-grid { grid-template-columns: 1fr; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚀 CMS Provisioning Platform</h1>
                        <p>Deploy complete CMS sites instantly with full Cloudflare infrastructure automation</p>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${stats.total_sites}</div>
                            <div class="stat-label">Sites Provisioned</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.active_sites}</div>
                            <div class="stat-label">Active Sites</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.total_storage}</div>
                            <div class="stat-label">Storage Used (GB)</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.bandwidth_used}</div>
                            <div class="stat-label">Bandwidth (GB)</div>
                        </div>
                    </div>

                    <div class="main-content">
                        <div class="provision-form" id="provisionForm">
                            <h2>🆕 Create New CMS Site</h2>
                            <form id="siteProvisioningForm">
                                <div class="form-group">
                                    <label for="client_name">Client Name</label>
                                    <input type="text" id="client_name" name="client_name" required placeholder="e.g., Acme Corporation">
                                </div>

                                <div class="form-group">
                                    <label for="site_id">Site ID (unique identifier)</label>
                                    <input type="text" id="site_id" name="site_id" required placeholder="e.g., acme-corp" pattern="[a-z0-9-]+">
                                    <small>Only lowercase letters, numbers, and hyphens allowed</small>
                                </div>

                                <div class="form-group">
                                    <label for="domain">Domain (optional)</label>
                                    <input type="text" id="domain" name="domain" placeholder="e.g., acmecorp.com">
                                    <small>Leave empty to use workers.dev subdomain</small>
                                </div>

                                <div class="form-group">
                                    <label for="contact_email">Contact Email</label>
                                    <input type="email" id="contact_email" name="contact_email" required placeholder="admin@acmecorp.com">
                                </div>

                                <div class="form-group">
                                    <label for="template">Template</label>
                                    <select id="template" name="template" required>
                                        <option value="standard">Standard (Blog/Corporate)</option>
                                        <option value="ecommerce">E-commerce</option>
                                        <option value="portfolio">Portfolio</option>
                                        <option value="blog">Blog</option>
                                    </select>
                                </div>

                                <button type="submit" class="btn-primary">🚀 Provision Site</button>
                            </form>
                        </div>

                        <div class="progress" id="provisionProgress">
                            <h2>⚡ Provisioning in Progress...</h2>
                            <div class="progress-step" id="step-validation">
                                <strong>🔍 Validating configuration...</strong>
                            </div>
                            <div class="progress-step" id="step-r2">
                                <strong>📦 Creating R2 storage bucket...</strong>
                            </div>
                            <div class="progress-step" id="step-d1">
                                <strong>🗄️ Setting up D1 database...</strong>
                            </div>
                            <div class="progress-step" id="step-dns">
                                <strong>🌐 Configuring DNS zone...</strong>
                            </div>
                            <div class="progress-step" id="step-worker">
                                <strong>⚡ Deploying worker...</strong>
                            </div>
                            <div class="progress-step" id="step-content">
                                <strong>🎨 Initializing content...</strong>
                            </div>
                            <div class="progress-step" id="step-complete">
                                <strong>🎉 Site ready!</strong>
                            </div>
                        </div>

                        <div class="sidebar">
                            <div class="pricing-table">
                                <h3>💰 Pricing Plans</h3>
                                <div class="plan selected" data-plan="starter">
                                    <div class="plan-name">Starter</div>
                                    <div class="plan-price">$9/month</div>
                                    <div class="plan-features">1GB storage, 10GB bandwidth</div>
                                </div>
                                <div class="plan" data-plan="professional">
                                    <div class="plan-name">Professional</div>
                                    <div class="plan-price">$29/month</div>
                                    <div class="plan-features">10GB storage, 100GB bandwidth</div>
                                </div>
                                <div class="plan" data-plan="enterprise">
                                    <div class="plan-name">Enterprise</div>
                                    <div class="plan-price">$99/month</div>
                                    <div class="plan-features">Unlimited storage & bandwidth</div>
                                </div>
                            </div>

                            <div class="info-card">
                                <h3>🎯 What Gets Provisioned</h3>
                                <ul class="feature-list">
                                    <li>Cloudflare R2 Storage Bucket</li>
                                    <li>Cloudflare D1 Database</li>
                                    <li>Cloudflare Worker (CMS Engine)</li>
                                    <li>DNS Zone & SSL Certificate</li>
                                    <li>Content Management System</li>
                                    <li>Admin Dashboard</li>
                                    <li>API Endpoints</li>
                                    <li>Automated Backups</li>
                                </ul>
                            </div>

                            <div class="info-card">
                                <h3>⚡ Provisioning Time</h3>
                                <p><strong>Typical completion: 2-5 minutes</strong></p>
                                <p>The automated process creates all necessary Cloudflare resources and deploys your CMS.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <script>
                    // Plan selection
                    document.querySelectorAll('.plan').forEach(plan => {
                        plan.addEventListener('click', () => {
                            document.querySelectorAll('.plan').forEach(p => p.classList.remove('selected'));
                            plan.classList.add('selected');
                        });
                    });

                    // Form submission
                    document.getElementById('siteProvisioningForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        
                        const formData = new FormData(e.target);
                        const selectedPlan = document.querySelector('.plan.selected').dataset.plan;
                        
                        const provisioningData = {
                            client_name: formData.get('client_name'),
                            site_id: formData.get('site_id'),
                            domain: formData.get('domain'),
                            contact_email: formData.get('contact_email'),
                            template: formData.get('template'),
                            plan: selectedPlan
                        };

                        // Show progress, hide form
                        document.getElementById('provisionForm').style.display = 'none';
                        document.getElementById('provisionProgress').style.display = 'block';

                        try {
                            await provisionSite(provisioningData);
                        } catch (error) {
                            console.error('Provisioning failed:', error);
                            alert('Provisioning failed: ' + error.message);
                            // Show form again
                            document.getElementById('provisionForm').style.display = 'block';
                            document.getElementById('provisionProgress').style.display = 'none';
                        }
                    });

                    async function provisionSite(data) {
                        const steps = ['validation', 'r2', 'd1', 'dns', 'worker', 'content', 'complete'];
                        
                        // Simulate progress
                        for (let i = 0; i < steps.length; i++) {
                            const stepElement = document.getElementById('step-' + steps[i]);
                            stepElement.classList.add('active');
                            
                            if (i === 0) {
                                // Start actual provisioning
                                const response = await fetch('/api/provision-site', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify(data)
                                });

                                if (!response.ok) {
                                    stepElement.classList.add('error');
                                    const error = await response.json();
                                    throw new Error(error.error || 'Provisioning failed');
                                }
                            }
                            
                            // Simulate step completion time
                            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                            
                            stepElement.classList.remove('active');
                            stepElement.classList.add('completed');
                        }

                        // Show success message
                        setTimeout(() => {
                            alert('🎉 Site provisioned successfully! Check your email for login details.');
                            window.location.reload();
                        }, 1000);
                    }

                    // Auto-generate site ID from client name
                    document.getElementById('client_name').addEventListener('input', (e) => {
                        const siteId = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9\s]/g, '')
                            .replace(/\s+/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '');
                        document.getElementById('site_id').value = siteId;
                    });
                </script>
            </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    async getProvisioningStats() {
        // In a real implementation, this would query actual statistics
        return {
            total_sites: 47,
            active_sites: 42,
            total_storage: 23.5,
            bandwidth_used: 156.7
        };
    }
}














