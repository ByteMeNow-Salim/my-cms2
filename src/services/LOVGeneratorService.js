// src/services/LOVGeneratorService.js
// Service for generating and maintaining LOV (List of Values) files

export class LOVGeneratorService {
    constructor(env) {
        this.env = env;
        this.r2 = env?.R2;
    }

    /**
     * Generate LOV file from module data based on lov_columns specification
     * @param {Object} moduleConfig - Module configuration from sys-modules.json
     * @param {Array} sourceData - Source data array (e.g., sys-menus.json content)
     * @returns {Array} Generated LOV data
     */
    async generateLOVData(moduleConfig, sourceData) {
        console.log(`🔧 Generating LOV data for module: ${moduleConfig.label}`);
        
        if (!moduleConfig.lov_file || !moduleConfig.lov_columns) {
            console.log(`  No lov_file or lov_columns specified for ${moduleConfig.label}`);
            return [];
        }

        const lovColumns = moduleConfig.lov_columns.split(',').map(col => col.trim());
        console.log(`  LOV columns: ${lovColumns.join(', ')}`);

        const lovData = [];

        // Process each item in source data
        for (const item of sourceData) {
            // Skip inactive menus
            if (item.active === 'No') {
                console.log(`  Skipping item ${item[moduleConfig.id_field]} - menu is inactive`);
                continue;
            }

            // Only process items that have details (sub-records)
            if (!item.details || !Array.isArray(item.details) || item.details.length === 0) {
                console.log(`  Skipping item ${item[moduleConfig.id_field]} - no details`);
                continue;
            }

            // Process each detail record
            for (const detail of item.details) {
                // Skip inactive sub-menus
                if (detail.active === 'No') {
                    console.log(`  Skipping sub-menu ${detail.sub_menu_id || detail[moduleConfig.detail_id_field]} - sub-menu is inactive`);
                    continue;
                }
                const lovRecord = {};
                
                // Extract specified columns from master and detail records
                for (const column of lovColumns) {
                    if (item.hasOwnProperty(column)) {
                        // Column exists in master record
                        lovRecord[column] = item[column];
                    } else if (detail.hasOwnProperty(column)) {
                        // Column exists in detail record
                        lovRecord[column] = detail[column];
                    } else {
                        // Column not found, set to null or derive it
                        if (column === 'target_window') {
                            // Special handling for target_window - could be derived from sub_menu_link or set to default
                            lovRecord[column] = detail.sub_menu_link ? 'Article' : 'Default';
                        } else {
                            lovRecord[column] = null;
                        }
                    }
                }

                // Only add if we have the required fields
                if (lovRecord.menu && lovRecord.sub_menu) {
                    lovData.push(lovRecord);
                    console.log(`  Added LOV record: ${lovRecord.menu} -> ${lovRecord.sub_menu}`);
                }
            }
        }

        console.log(`  Generated ${lovData.length} LOV records`);
        return lovData;
    }

    /**
     * Save LOV data to R2 storage
     * @param {string} lovFileName - Name of the LOV file (e.g., 'sys-menus-lov.json')
     * @param {Array} lovData - LOV data to save
     */
    async saveLOVFile(lovFileName, lovData) {
        try {
            console.log(`💾 Saving LOV file: ${lovFileName} with ${lovData.length} records`);
            
            const jsonContent = JSON.stringify(lovData, null, 2);
            await this.r2.put(lovFileName, jsonContent, {
                httpMetadata: {
                    contentType: 'application/json',
                },
            });
            
            console.log(`✅ LOV file saved successfully: ${lovFileName}`);
        } catch (error) {
            console.error(`❌ Error saving LOV file ${lovFileName}:`, error);
            throw error;
        }
    }

    /**
     * Load existing LOV data from R2 storage
     * @param {string} lovFileName - Name of the LOV file
     * @returns {Array} Existing LOV data or empty array if not found
     */
    async loadLOVFile(lovFileName) {
        try {
            const lovFile = await this.r2.get(lovFileName);
            if (lovFile) {
                const lovData = await lovFile.json();
                console.log(`📂 Loaded existing LOV file: ${lovFileName} with ${lovData.length} records`);
                return lovData;
            } else {
                console.log(`📂 LOV file not found: ${lovFileName}, will create new one`);
                return [];
            }
        } catch (error) {
            console.error(`❌ Error loading LOV file ${lovFileName}:`, error);
            return [];
        }
    }

    /**
     * Regenerate and save LOV file for a specific module
     * @param {string} moduleLabel - Module label (e.g., 'Menus')
     */
    async regenerateLOVForModule(moduleLabel) {
        try {
            console.log(`🔄 Regenerating LOV for module: ${moduleLabel}`);

            // Load module configuration
            const modulesFile = await this.r2.get('sys-modules.json');
            if (!modulesFile) {
                throw new Error('sys-modules.json not found');
            }
            
            const modulesData = await modulesFile.json();
            console.log(`📋 Loaded modules data, type: ${typeof modulesData}, has modules property: ${!!modulesData.modules}`);
            
            // Handle both array format and object format with modules property
            let modules;
            if (Array.isArray(modulesData)) {
                modules = modulesData;
            } else if (modulesData.modules && Array.isArray(modulesData.modules)) {
                modules = modulesData.modules;
            } else {
                console.error('❌ sys-modules.json structure not recognized:', modulesData);
                throw new Error('sys-modules.json must be an array or object with modules property');
            }
            
            console.log(`📋 Using modules array with ${modules.length} modules`);
            const moduleConfig = modules.find(m => m.label === moduleLabel);
            
            if (!moduleConfig) {
                throw new Error(`Module not found: ${moduleLabel}`);
            }

            if (!moduleConfig.lov_file || !moduleConfig.lov_columns) {
                console.log(`  Module ${moduleLabel} does not have LOV configuration`);
                return;
            }

            // Load source data
            const sourceFile = await this.r2.get(moduleConfig.data_file);
            if (!sourceFile) {
                throw new Error(`Source data file not found: ${moduleConfig.data_file}`);
            }
            
            const sourceData = await sourceFile.json();

            // Generate LOV data
            const lovData = await this.generateLOVData(moduleConfig, sourceData);

            // Save LOV file
            await this.saveLOVFile(moduleConfig.lov_file, lovData);

            console.log(`✅ LOV regeneration completed for ${moduleLabel}`);
        } catch (error) {
            console.error(`❌ Error regenerating LOV for ${moduleLabel}:`, error);
            throw error;
        }
    }

    /**
     * Regenerate LOV files for all modules that have LOV configuration
     */
    async regenerateAllLOVFiles() {
        try {
            console.log(`🔄 Regenerating all LOV files`);

            // Load module configuration
            const modulesFile = await this.r2.get('sys-modules.json');
            if (!modulesFile) {
                throw new Error('sys-modules.json not found');
            }
            
            const modulesData = await modulesFile.json();
            console.log(`📋 Loaded modules data for all LOV generation, type: ${typeof modulesData}, has modules property: ${!!modulesData.modules}`);
            
            // Handle both array format and object format with modules property
            let modules;
            if (Array.isArray(modulesData)) {
                modules = modulesData;
            } else if (modulesData.modules && Array.isArray(modulesData.modules)) {
                modules = modulesData.modules;
            } else {
                console.error('❌ sys-modules.json structure not recognized:', modulesData);
                throw new Error('sys-modules.json must be an array or object with modules property');
            }
            
            console.log(`📋 Using modules array with ${modules.length} modules for LOV generation`);
            for (const moduleConfig of modules) {
                if (moduleConfig.lov_file && moduleConfig.lov_columns) {
                    console.log(`  Processing module: ${moduleConfig.label}`);
                    await this.regenerateLOVForModule(moduleConfig.label);
                }
            }

            console.log(`✅ All LOV files regenerated`);
        } catch (error) {
            console.error(`❌ Error regenerating all LOV files:`, error);
            throw error;
        }
    }
}
