// src/services/DashboardService.js
export class DashboardService {
    constructor(r2) {
        this.r2 = r2;
    }

    async renderDashboard(request) {
        const modulesData = await this.getModulesData();
        const groupedModules = this.groupModules(modulesData.modules);

        const moduleGroupsHTML = Object.entries(groupedModules).map(([groupName, modules]) => {
            const moduleCardsHTML = modules.map(module => this.renderModuleCard(module)).join('');
            return `
                <div class="module-group">
                    <h2 class="group-title">${groupName}</h2>
                    <div class="modules-grid">
                        ${moduleCardsHTML}
                    </div>
                </div>
            `;
        }).join('');

        const pageHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Site Manager</title>
                <link rel="stylesheet" href="/sys-dashboard.css">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
            </head>
            <body>
                <header class="site-header">
                    <h1>Site Manager &rarr; bulletlink.com</h1>
                    <nav>
                        <a href="#">24x7 Support</a>
                        <a href="#">Quick Start</a>
                        <a href="#">FAQs</a>
                        <a href="#">Tutorials</a>
                        <a href="#">Theme</a>
                        <a href="#">Templates</a>
                        <a href="#">Home</a>
                        <a href="#">Logout</a>
                    </nav>
                </header>
                <main class="main-content">
                    ${moduleGroupsHTML}
                </main>
            </body>
            </html>
        `;

        return new Response(pageHTML, { headers: { 'Content-Type': 'text/html' } });
    }

    async getModulesData() {
        const object = await this.r2.get('sys-modules.json');
        if (object === null) {
            return { modules: [] };
        }
        return object.json();
    }

    groupModules(modules) {
        return modules.reduce((acc, module) => {
            const group = module.group || 'Uncategorized';
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push(module);
            return acc;
        }, {});
    }

    renderModuleCard(module) {
        return `
            <a href="${module.path}" class="module-card">
                <i class="${module.icon_class} module-icon"></i>
                <span class="module-label">${module.label}</span>
            </a>
        `;
    }
}
