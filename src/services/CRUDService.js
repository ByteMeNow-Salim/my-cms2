// src/services/CRUDService.js
import { ViewService } from './ViewService.js';
import { hooks } from '../hooks/index.js';
import { S3Client, PutObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Worker-level cache for configuration files
const WORKER_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

// Pre-computed LOV results cache (for expensive operations)
const LOV_RESULTS_CACHE = new Map();
const LOV_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for LOV results

// System forms cache for dynamic form generation
const SYSTEM_FORMS_CACHE = new Map();
const SYSTEM_FORMS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes TTL

// ID generation cache to avoid expensive MAX queries
const ID_CACHE = new Map();
const ID_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Default values for modules (replaces many async hook calls)
const MODULE_DEFAULTS = {
    'menus': {
        active: 'Yes',
        order_sequence: 1,
        menu_color: '#000000',
        menu_text_color: '#000000',
        menu_html_link_flag: 'No',
        menu_position: 'Default',
        details: []
    },
    'menus_detail': {
        active: 'Yes',
        sub_menu_order: 1
    },
    'system-layouts': {
        layout_name: '',
        form: '',
        layout_body: ''
    },
    'articles': {
        active: 'Yes',
        highlight1_flag: 'No',
        highlight2_flag: 'No',
        highlight3_flag: 'No',
        highlight4_flag: 'No',
        highlight5_flag: 'No',
        highlight6_flag: 'No',
        highlight7_flag: 'No',
        highlight8_flag: 'No',
        highlight9_flag: 'No',
        articlegroup1_flag: 'No',
        articlegroup2_flag: 'No',
        articlegroup3_flag: 'No',
        articlegroup4_flag: 'No',
        articlegroup5_flag: 'No',
        articlegroup6_flag: 'No',
        articlegroup7_flag: 'No',
        articlegroup8_flag: 'No',
        articlegroup9_flag: 'No'
    },
    'systemforms': {
        active: 'Yes'
    }
};

export class CRUDService {
    constructor(env) {
        this.env = env;
        this.r2 = env.R2;
        this.d1 = env.D1;
        
        // Request-level cache for ultra-fast access within single request
        this.requestCache = new Map();
        
        // Check if D1 is available
        if (!this.d1) {
            console.warn('D1 database binding not available. D1 storage operations will fail.');
        }
    }

    // Optimized ID generation with caching
    async _getNextId(tableName, idField) {
        const cacheKey = `${tableName}_${idField}`;
        const now = Date.now();
        
        // Check cache first
        const cached = ID_CACHE.get(cacheKey);
        if (cached && now < cached.expiry) {
            cached.counter++;
            console.log(`🔧 ⚡ ID from cache: ${tableName}.${idField} = ${cached.counter}`);
            return cached.counter;
        }
        
        // Cache miss - get max ID from database
        console.log(`🔧 🔄 Cache miss, fetching max ID for ${tableName}.${idField}`);
        const maxIdStmt = this.d1.prepare(`SELECT MAX(${idField}) as max_id FROM ${tableName}`);
        const maxIdResult = await maxIdStmt.first();
        const maxId = maxIdResult?.max_id || 0;
        const nextId = maxId + 1;
        
        // Cache the result
        ID_CACHE.set(cacheKey, {
            counter: nextId,
            expiry: now + ID_CACHE_TTL
        });
        
        console.log(`🔧 ✅ Cached new ID counter for ${tableName}: ${nextId}`);
        return nextId;
    }

    // Async R2 write that doesn't block the response
    _asyncR2Write(dataFile, data) {
        // Use setTimeout to make this truly async (fire-and-forget)
        setTimeout(async () => {
            try {
                await this.r2.put(dataFile, JSON.stringify(data, null, 2), {
                    httpMetadata: { contentType: 'application/json' }
                });
                console.log(`🔧 ⚡ Async R2 write completed: ${dataFile}`);
            } catch (error) {
                console.error(`🔧 ❌ Async R2 write failed for ${dataFile}:`, error.message);
            }
        }, 0);
    }

    // Helper function to convert date fields to Unix milliseconds
    _convertDateFieldsToUnix(data) {
        const convertedData = { ...data };
        
        Object.keys(convertedData).forEach(key => {
            if (key.endsWith('_date') && convertedData[key]) {
                const value = convertedData[key];
                
                // If it's already a number (Unix timestamp), keep it
                if (typeof value === 'number') {
                    return;
                }
                
                // If it's a string, try to parse and convert
                if (typeof value === 'string' && value.trim()) {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        convertedData[key] = date.getTime();
                    }
                }
            }
        });
        
        return convertedData;
    }

    // Helper function to convert Unix timestamps back to date strings for editing
    _convertUnixToDateFields(data) {
        const convertedData = { ...data };
        
        Object.keys(convertedData).forEach(key => {
            if (key.endsWith('_date') && convertedData[key]) {
                const value = convertedData[key];
                
                // If it's a number (Unix timestamp), convert to date string
                if (typeof value === 'number' && value > 0) {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        // Check if the field name suggests it's a date-only field
                        if (key === 'issue_date' || key === 'starting_date' || key === 'ending_date') {
                            // Format for HTML date input: YYYY-MM-DD
                            convertedData[key] = date.toISOString().slice(0, 10);
                        } else {
                            // Format for HTML datetime-local input: YYYY-MM-DDTHH:MM
                            convertedData[key] = date.toISOString().slice(0, 16);
                        }
                    }
                }
            }
        });
        
        return convertedData;
    }

    async getModuleConfig(modulePath) {
        // Check request-level cache first (ultra-fast)
        const requestCacheKey = `module_config_${modulePath}`;
        if (this.requestCache.has(requestCacheKey)) {
            return this.requestCache.get(requestCacheKey);
        }
        
        // Check worker-level cache
        const cacheKey = 'sys-modules.json';
        const cached = WORKER_CACHE.get(cacheKey);
        let modulesData;
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            modulesData = cached.data;
        } else {
            // Cache miss or expired - fetch from R2
            const modulesObject = await this.r2.get('sys-modules.json');
            if (!modulesObject) {
                throw new Error('Configuration file "sys-modules.json" not found in R2 bucket.');
            }
            modulesData = await modulesObject.json();
            
            // Cache the result
            WORKER_CACHE.set(cacheKey, {
                data: modulesData,
                timestamp: Date.now()
            });
        }
        
        const moduleConfig = modulesData.modules.find(m => m.path === modulePath);
        if (!moduleConfig) {
            throw new Error(`Module not found: ${modulePath}`);
        }
        
        // Cache in request-level cache
        this.requestCache.set(requestCacheKey, moduleConfig);
        return moduleConfig;
    }

    // Method to invalidate cache (call when sys-modules.json is updated)
    static invalidateCache(cacheKey = null) {
        if (cacheKey) {
            WORKER_CACHE.delete(cacheKey);
        } else {
            WORKER_CACHE.clear();
        }
        // Also clear LOV cache when configurations change
        LOV_RESULTS_CACHE.clear();
        // Also clear system forms cache
        SYSTEM_FORMS_CACHE.clear();
        console.log('🗑️ All caches invalidated');
    }

    // Method to specifically invalidate system forms cache
    static invalidateSystemFormsCache() {
        SYSTEM_FORMS_CACHE.clear();
        console.log('🗑️ System forms cache invalidated');
    }

    // Load and cache system forms for dynamic form generation
    async getSystemForms() {
        const cacheKey = 'sys-system-forms';
        const cached = SYSTEM_FORMS_CACHE.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < SYSTEM_FORMS_CACHE_TTL) {
            return cached.data;
        }
        
                // Cache miss or expired - fetch from R2
        try {
            const systemFormsObject = await this.r2.get('sys-system-forms.json');
            if (!systemFormsObject) {
                console.warn('sys-system-forms.json not found in R2 bucket');
                return [];
            }

            const rawData = await systemFormsObject.json();
            
            // Handle both direct array format and wrapped object format
            let systemFormsData;
            if (Array.isArray(rawData)) {
                // Direct array format: [{"form_master_id": 182, ...}]
                systemFormsData = rawData;
            } else if (rawData && Array.isArray(rawData.forms)) {
                // Wrapped object format: {"forms": [{"form_master_id": 182, ...}]}
                systemFormsData = rawData.forms;
            } else {
                console.error('Invalid system forms data structure:', rawData);
                return [];
            }

            // Cache the result
            SYSTEM_FORMS_CACHE.set(cacheKey, {
                data: systemFormsData,
                timestamp: Date.now()
            });

            console.log(`🔧 ✅ System forms loaded and cached: ${Array.isArray(systemFormsData) ? systemFormsData.length : 'unknown'} forms`);
            return systemFormsData;
        } catch (error) {
            console.error('Error loading sys-system-forms.json:', error);
            return [];
        }
    }

    // Get form definition by form_master_id from sys-system-forms.json
    async getFormDefinitionByMasterId(formMasterId) {
        const systemForms = await this.getSystemForms();
        
        if (!Array.isArray(systemForms)) {
            return null;
        }
        
        const formDefinition = systemForms.find(form => form.form_master_id == formMasterId);
        
        if (!formDefinition) {
            console.warn(`Form definition not found for form_master_id: ${formMasterId}`);
            return null;
        }
        
        // Convert to the expected format for getFormFields
        return {
            fields: formDefinition.details.map(detail => ({
                name: detail.name,
                label: detail.label,
                type: detail.type || 'text',
                required: detail.required || false,
                options: detail.options || undefined,
                lov_static: detail.lov_static || undefined,
                lov_json: detail.lov_json || undefined
            }))
        };
    }

    // Get form definition by matching module label with form description
        async getModuleConfigByLabel(moduleLabel) {
        // Check worker-level cache
        const cacheKey = 'sys-modules.json';
        const cached = WORKER_CACHE.get(cacheKey);
        let modulesData;
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            modulesData = cached.data;
        } else {
            // Cache miss or expired - fetch from R2
            const modulesObject = await this.r2.get('sys-modules.json');
            if (!modulesObject) {
                throw new Error('Configuration file "sys-modules.json" not found in R2 bucket.');
            }
            
            modulesData = await modulesObject.json();
            
            // Cache the result
            WORKER_CACHE.set(cacheKey, {
                data: modulesData,
                timestamp: Date.now()
            });
        }
        
        return modulesData.modules.find(module => module.label === moduleLabel);
    }

        async getFormDefinitionByLabel(moduleLabel, isDetailForm = false) {
        console.log(`🔍 getFormDefinitionByLabel called with moduleLabel: "${moduleLabel}", isDetailForm: ${isDetailForm}`);
        
        const systemForms = await this.getSystemForms();
        console.log(`📋 System forms loaded: ${Array.isArray(systemForms) ? systemForms.length : 'not array'} forms`);

        if (!Array.isArray(systemForms)) {
            console.error(`❌ System forms is not an array:`, typeof systemForms);
            return null;
        }

        // Check if we have module configuration with form mapping
        let targetDescription = moduleLabel;
        
        // Try to get module config to check for form mapping fields
        try {
            const moduleConfig = await this.getModuleConfigByLabel(moduleLabel);
            console.log(`🔍 Module config for "${moduleLabel}":`, moduleConfig);
            console.log(`🔍 isDetailForm: ${isDetailForm}`);
            
            if (moduleConfig) {
                if (isDetailForm && moduleConfig.detail_form_description) {
                    targetDescription = moduleConfig.detail_form_description;
                    console.log(`🔄 Using detail_form_description: "${targetDescription}" for module "${moduleLabel}"`);
                } else if (!isDetailForm && moduleConfig.master_form_description) {
                    targetDescription = moduleConfig.master_form_description;
                    console.log(`🔄 Using master_form_description: "${targetDescription}" for module "${moduleLabel}"`);
                } else {
                    console.log(`⚠️ No matching form description found. isDetailForm: ${isDetailForm}, detail_form_description: ${moduleConfig.detail_form_description}, master_form_description: ${moduleConfig.master_form_description}`);
                }
            } else {
                console.log(`⚠️ No module config found for "${moduleLabel}"`);
            }
        } catch (error) {
            console.log(`📝 Error getting module config for "${moduleLabel}":`, error);
        }

        const formDefinition = systemForms.find(form => form.description === targetDescription);

        if (!formDefinition) {
            console.warn(`⚠️ Form definition not found for target: "${targetDescription}" (mapped from "${moduleLabel}")`);
            console.log(`🔍 Available descriptions:`, systemForms.map(form => form.description));
            
            // Return a basic fallback form structure to prevent errors
            return {
                fields: [
                    {
                        name: 'description',
                        label: 'Description',
                        type: 'text',
                        required: true
                    }
                ]
            };
        }

        console.log(`🎯 ✅ Found dynamic form definition for "${moduleLabel}" with form_master_id: ${formDefinition.form_master_id}`);
        console.log(`📝 Form has ${formDefinition.details.length} fields`);

        // Convert to the expected format for getFormFields
        const convertedForm = {
            fields: formDefinition.details
                .filter(detail => detail.active !== "No" && detail.advanced_user_level_flag !== "Yes") // Filter out inactive and advanced fields
                .map(detail => {
                    let fieldType = this._mapInputType(detail.type || detail.input_type);
                    let defaultValue = detail.default_value || undefined;
                    
                    // If field has hidden_flag="Yes", override type to 'hidden' (but keep in form)
                    if (detail.hidden_flag === "Yes") {
                        fieldType = 'hidden';
                        console.log(`🔒 Setting field "${detail.name || detail.column_name}" as hidden input`);
                    }
                    
                    // Handle dynamic default values for date fields (only for visible date fields)
                    if (fieldType === 'date' && defaultValue === 'Now()') {
                        defaultValue = this._getCurrentDate();
                        console.log(`📅 Setting default date for "${detail.name || detail.column_name}": ${defaultValue}`);
                    }
                    
                    return {
                        name: detail.name || detail.column_name,
                        label: detail.label || detail.caption,
                        type: fieldType,
                        required: detail.required || (detail.required_flag === "Yes"),
                        default_value: defaultValue,
                        options: detail.options || undefined,
                        lov_static: detail.lov_static || undefined,
                        lov_json: detail.lov_json || undefined,
                        hidden: detail.hidden_flag === "Yes", // Add hidden flag for form generation
                        help_tip: detail.help_tip || undefined, // Add help_tip for tooltip
                        // Add field configuration properties
                        input_length: detail.input_length || undefined,
                        display_length: detail.display_length || undefined,
                        value_minimum_number: detail.value_minimum_number || undefined,
                        value_maximum_number: detail.value_maximum_number || undefined,
                        value_minimum_date: detail.value_minimum_date || undefined,
                        value_maximum_date: detail.value_maximum_date || undefined,
                        order_sequence: detail.order_sequence || 0
                    };
                })
                .sort((a, b) => {
                    // Sort by order_sequence, then by name if order_sequence is the same
                    const aOrder = parseFloat(a.order_sequence) || 0;
                    const bOrder = parseFloat(b.order_sequence) || 0;
                    if (aOrder !== bOrder) {
                        return aOrder - bOrder;
                    }
                    return (a.name || '').localeCompare(b.name || '');
                })
        };

        console.log(`🔄 Converted form with ${convertedForm.fields.length} fields (sorted by order_sequence)`);
        return convertedForm;
    }

    // Helper method to map input types from different formats
    _mapInputType(inputType) {
        if (!inputType) return 'text';
        
        const typeMapping = {
            'Text': 'text',
            'Number': 'number',
            'Email': 'email',
            'Date': 'date',
            'Password': 'password',
            'Textarea': 'textarea',
            'Select': 'select',
            'Checkbox': 'checkbox',
            'Radio': 'radio',
            'OLE': 'ole',
            'OLE_MULTIPLE': 'ole_multiple'
        };
        
        return typeMapping[inputType] || inputType.toLowerCase();
    }

    // Helper method to convert date string to 13-digit Unix timestamp
    _dateToUnixTimestamp(dateString) {
        if (!dateString) return null;
        
        try {
            // Parse the date string (YYYY-MM-DD format from HTML date input)
            const date = new Date(dateString + 'T00:00:00.000Z'); // Add time to ensure UTC
            const timestamp = date.getTime(); // Returns 13-digit timestamp
            
            console.log(`📅 Converting date "${dateString}" to timestamp: ${timestamp}`);
            return timestamp;
        } catch (error) {
            console.error(`❌ Error converting date "${dateString}" to timestamp:`, error);
            return null;
        }
    }

    // Helper method to convert 13-digit Unix timestamp to date string
    _unixTimestampToDate(timestamp) {
        if (!timestamp) return '';
        
        try {
            // Convert timestamp to Date object
            const date = new Date(parseInt(timestamp));
            
            // Format as YYYY-MM-DD for HTML date input
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;
            
            console.log(`📅 Converting timestamp ${timestamp} to date: "${dateString}"`);
            return dateString;
        } catch (error) {
            console.error(`❌ Error converting timestamp "${timestamp}" to date:`, error);
            return '';
        }
    }

    // Helper method to get current date in YYYY-MM-DD format
    _getCurrentDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Helper method to process form data and convert date fields to timestamps
    async _processDateFieldsForSave(data, moduleLabel, isDetailForm = false) {
        try {
            // Get form fields to identify date fields
            const formFields = await this.getFormFields(null, null, moduleLabel, isDetailForm);
            if (!formFields || !formFields.fields) {
                return data;
            }

            const processedData = { ...data };

            // Process each field
            formFields.fields.forEach(field => {
                if (field.type === 'date' && processedData[field.name]) {
                    const timestamp = this._dateToUnixTimestamp(processedData[field.name]);
                    if (timestamp !== null) {
                        processedData[field.name] = timestamp;
                        console.log(`📅 Processed date field "${field.name}": ${data[field.name]} -> ${timestamp}`);
                    }
                }
            });

            return processedData;
        } catch (error) {
            console.error('Error processing date fields for save:', error);
            return data; // Return original data if processing fails
        }
    }

    // Helper method to process data and convert timestamps back to dates for editing
    async _processDateFieldsForEdit(data, moduleLabel, isDetailForm = false) {
        try {
            // Get form fields to identify date fields
            const formFields = await this.getFormFields(null, null, moduleLabel, isDetailForm);
            if (!formFields || !formFields.fields) {
                return data;
            }

            const processedData = { ...data };

            // Process each field
            formFields.fields.forEach(field => {
                if (field.type === 'date' && processedData[field.name]) {
                    const dateString = this._unixTimestampToDate(processedData[field.name]);
                    if (dateString) {
                        processedData[field.name] = dateString;
                        console.log(`📅 Processed timestamp field "${field.name}": ${data[field.name]} -> ${dateString}`);
                    }
                }
            });

            return processedData;
        } catch (error) {
            console.error('Error processing date fields for edit:', error);
            return data; // Return original data if processing fails
        }
    }

    // Pre-compute common LOV results for ultra-fast access
    async _precomputeLOVResults() {
        try {
            // Pre-compute form definition file list (most common LOV query)
            const cacheKey = 'sys-modules.json';
            const cached = WORKER_CACHE.get(cacheKey);
            let modulesData;
            
            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                modulesData = cached.data;
            } else {
                const modulesObject = await this.r2.get('sys-modules.json');
                if (modulesObject) {
                    modulesData = await modulesObject.json();
                    WORKER_CACHE.set(cacheKey, {
                        data: modulesData,
                        timestamp: Date.now()
                    });
                }
            }
            
            if (modulesData?.modules) {
                // Pre-compute form definition file options
                const formFiles = modulesData.modules
                    .flatMap(m => [m.form_definition_file, m.detail_form_definition_file])
                    .filter(Boolean)
                    .map(file => String(file).trim())
                    .filter(Boolean);
                
                const uniqueFormFiles = Array.from(new Set(formFiles)).sort();
                const formOptionsHTML = uniqueFormFiles
                    .map(file => `<option value="${file}">${file}</option>`)
                    .join('');
                
                // Cache the pre-computed result
                LOV_RESULTS_CACHE.set('form_definition_files', {
                    html: `<option value=""></option>${formOptionsHTML}`,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            // Silent fail for pre-computation
        }
    }

    // Get cached LOV result or compute if needed
    async getCachedLOVResult(lovKey, computeFunction) {
        const cached = LOV_RESULTS_CACHE.get(lovKey);
        
        if (cached && Date.now() - cached.timestamp < LOV_CACHE_TTL) {
            return cached.html;
        }
        
        // Cache miss - compute result
        const result = await computeFunction();
        LOV_RESULTS_CACHE.set(lovKey, {
            html: result,
            timestamp: Date.now()
        });
        
        return result;
    }

    // Fast synchronous default value application (replaces many hook calls)
    _applyDefaults(modulePath, data, isDetail = false) {
        const defaultKey = isDetail ? `${modulePath}_detail` : modulePath;
        const defaults = MODULE_DEFAULTS[defaultKey];
        
        if (!defaults) {
            return data;
        }
        
        // Apply defaults only for missing values
        const result = { ...data };
        Object.keys(defaults).forEach(key => {
            if (result[key] === undefined || result[key] === null || result[key] === '') {
                result[key] = defaults[key];
            }
        });
        
        return result;
    }

    // Optimized batch operation for menu + submenu updates
    async updateMenuWithDetails(modulePath, itemId, menuUpdates, detailOperations = []) {
        const config = await this.getModuleConfig(modulePath);
        const { items, originalData } = await this._loadAndConvertData(config.data_file);

        const itemIndex = items.findIndex(item => item[config.id_field] == itemId);
        if (itemIndex === -1) {
            throw new Error(`Item with ID ${itemId} not found in module ${modulePath}.`);
        }

        const originalItem = { ...items[itemIndex] };
        
        // Process menu updates
        if (menuUpdates && Object.keys(menuUpdates).length > 0) {
            let processedMenuUpdates = await this._runHook('beforeUpdate', modulePath, config, menuUpdates, originalItem);
            items[itemIndex] = { ...items[itemIndex], ...processedMenuUpdates };
        }

        // Process detail operations in batch
        if (detailOperations && detailOperations.length > 0) {
            const detailIdField = config.detail_id_field || 'form_detail_id';
            
            for (const operation of detailOperations) {
                switch (operation.type) {
                    case 'create':
                        if (!items[itemIndex].details) {
                            items[itemIndex].details = [];
                        }
                        
                        // Apply fast defaults first
                        operation.data = this._applyDefaults(modulePath, operation.data, true);
                        
                        let processedDetailData = await this._runHook('beforeCreateDetail', modulePath, config, operation.data, items[itemIndex]);
                        
                        // Generate new detail ID
                        const newDetailId = items[itemIndex].details.length > 0 ? 
                            Math.max(...items[itemIndex].details.map(d => d[detailIdField] || 0)) + 1 : 1;
                        processedDetailData[detailIdField] = newDetailId;
                        
                        // Handle checkbox values for form fields - use dynamic form generation
                        const detailFormFields = await this.getFormFields(config.detail_form_definition_file, null, config.label, true);
                        if (detailFormFields) {
                            detailFormFields.fields.forEach(field => {
                                if (field.type === 'checkbox') {
                                    processedDetailData[field.name] = processedDetailData[field.name] === 'Yes' ? 'Yes' : 'No';
                                }
                            });
                        }
                        
                        items[itemIndex].details.push(processedDetailData);
                        await this._runHook('afterCreateDetail', modulePath, config, processedDetailData, items[itemIndex]);
                        break;
                        
                    case 'update':
                        const detailIndex = items[itemIndex].details.findIndex(d => d[detailIdField] == operation.detailId);
                        if (detailIndex !== -1) {
                            const originalDetail = { ...items[itemIndex].details[detailIndex] };
                            let processedDetailUpdates = await this._runHook('beforeUpdateDetail', modulePath, config, operation.data, originalDetail, items[itemIndex]);
                            
                            // Handle checkbox values - use dynamic form generation
                            const detailFormFields = await this.getFormFields(config.detail_form_definition_file, null, config.label, true);
                            if (detailFormFields) {
                                detailFormFields.fields.forEach(field => {
                                    if (field.type === 'checkbox') {
                                        processedDetailUpdates[field.name] = processedDetailUpdates[field.name] === 'Yes' ? 'Yes' : 'No';
                                    }
                                });
                            }
                            
                            items[itemIndex].details[detailIndex] = { ...items[itemIndex].details[detailIndex], ...processedDetailUpdates };
                            await this._runHook('afterUpdateDetail', modulePath, config, items[itemIndex].details[detailIndex], items[itemIndex]);
                        }
                        break;
                        
                    case 'delete':
                        const detailToDeleteIndex = items[itemIndex].details.findIndex(d => d[detailIdField] == operation.detailId);
                        if (detailToDeleteIndex !== -1) {
                            const detailToDelete = { ...items[itemIndex].details[detailToDeleteIndex] };
                            await this._runHook('beforeDeleteDetail', modulePath, config, detailToDelete, items[itemIndex]);
                            items[itemIndex].details.splice(detailToDeleteIndex, 1);
                            await this._runHook('afterDeleteDetail', modulePath, config, detailToDelete, items[itemIndex]);
                        }
                        break;
                }
            }
        }

        // Single write operation for all changes
        await this._writeData(config.data_file, items, originalData);
        
        // Run final hooks
        if (menuUpdates && Object.keys(menuUpdates).length > 0) {
            await this._runHook('afterUpdate', modulePath, config, items[itemIndex], originalItem);
        }
        
        return items[itemIndex];
    }

    async _loadAndConvertData(dataFile) {
        const dataObject = await this.r2.get(dataFile);
        if (!dataObject) {
            return { items: [], originalData: null };
        }
        const originalData = await dataObject.json();
        let items = [];
    
        if (originalData && Array.isArray(originalData.rows) && Array.isArray(originalData.headers)) {
            // Handle headers/rows format
            const headers = originalData.headers;
            items = originalData.rows.map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index];
                });
                return obj;
            });
        } else if (originalData && typeof originalData === 'object' && !Array.isArray(originalData)) {
            // Handle object-wrapped arrays, e.g., { "forms": [...] }
            const keys = Object.keys(originalData);
            if (keys.length > 0 && Array.isArray(originalData[keys[0]])) {
                items = originalData[keys[0]];
            }
        } else if (Array.isArray(originalData)) {
            // Handle plain arrays
            items = originalData;
        }
        return { items, originalData };
    }

    async _writeData(dataFile, items, originalData) {
        let dataToWrite;

        if (originalData && Array.isArray(originalData.headers) && Array.isArray(originalData.rows)) {
            // Handle headers/rows format
            dataToWrite = {
                headers: originalData.headers,
                rows: items.map(item => {
                    const row = [];
                    originalData.headers.forEach(header => {
                        row.push(item[header]);
                    });
                    return row;
                })
            };
        } else if (originalData && typeof originalData === 'object' && !Array.isArray(originalData)) {
            // Handle object-wrapped arrays, e.g., { "forms": [...] }
            dataToWrite = {
                [Object.keys(originalData)[0]]: items
            };
        } else {
            // This handles both plain arrays and new files (where originalData is null).
            // In both scenarios, we just want to write the items array.
            dataToWrite = items;
        }

        const httpMetadata = { contentType: 'application/json' };
        await this.r2.put(dataFile, JSON.stringify(dataToWrite, null, 2), { httpMetadata });
    }

    async list(modulePath, page = 1, pageSize = null) {
        const config = await this.getModuleConfig(modulePath);
        
        // Get pagination settings from config - only enable if explicitly configured
        const paginationConfig = config.pagination || null;
        const isPaginationEnabled = paginationConfig && paginationConfig.enabled === true;
        
        let actualPageSize = 20; // Default fallback
        if (isPaginationEnabled) {
            const defaultPageSize = paginationConfig.default_page_size || paginationConfig.page_size || 20;
            actualPageSize = pageSize || defaultPageSize;
        }
        
        if (config.storage_type === 'D1' || config.storage_type?.trim() === 'D1') {
            // Handle D1 storage
            
            if (!this.d1) {
                throw new Error(`D1 database not available for module "${modulePath}"`);
            }
            
            const tableName = config.storage_D1_table;
            if (!tableName) {
                throw new Error(`D1 table name not specified for module "${modulePath}"`);
            }
            

            
            try {
                // Build query with optional ORDER BY clause
                let query = `SELECT * FROM ${tableName}`;
                if (config.storage_D1_order_by) {
                    query += ` ORDER BY ${config.storage_D1_order_by}`;
                }
                
                // Add pagination if enabled
                let totalCount = 0;
                let items = [];
                
                if (isPaginationEnabled) {
                    // Get total count first
                    const countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
                    const countStmt = this.d1.prepare(countQuery);
                    const countResult = await countStmt.first();
                    totalCount = countResult?.count || 0;
                    
                    // Add LIMIT and OFFSET for pagination
                    const offset = (page - 1) * actualPageSize;
                    query += ` LIMIT ${actualPageSize} OFFSET ${offset}`;
                } else {
                    // Query without pagination
                }
                
                const stmt = this.d1.prepare(query);
                const result = await stmt.all();
                items = result.results || [];
                
                // Convert Unix timestamps back to date strings for display
                const convertedItems = items.map(item => this._convertUnixToDateFields(item));
                
                // Return pagination metadata if enabled
                if (isPaginationEnabled) {
                    const totalPages = Math.ceil(totalCount / actualPageSize);
                    return {
                        items: convertedItems,
                        pagination: {
                            current_page: page,
                            page_size: actualPageSize,
                            total_count: totalCount,
                            total_pages: totalPages,
                            has_previous: page > 1,
                            has_next: page < totalPages,
                            config: paginationConfig
                        }
                    };
                } else {
                    return convertedItems;
                }
            } catch (error) {
                console.error(`D1 query error for table ${tableName}:`, error);
                throw new Error(`Failed to query D1 table ${tableName}: ${error.message}`);
            }
        }
        
        let dataFile;
        if (config.storage_type === 'array') {
            dataFile = config.data_file;
        } else if (config.storage_type === 'multiple' && config.list_source_name) {
            const listSource = config.json_files.find(f => f.name === config.list_source_name);
            if (listSource) {
                dataFile = listSource.file_path;
            }
        }

        if (!dataFile) {
            throw new Error(`Module "${modulePath}" is not configured for list view. Config received: ${JSON.stringify(config, null, 2)}`);
        }

        const { items } = await this._loadAndConvertData(dataFile);
        
        // Handle pagination for array storage
        if (isPaginationEnabled) {
            const totalCount = items.length;
            const totalPages = Math.ceil(totalCount / actualPageSize);
            const offset = (page - 1) * actualPageSize;
            const paginatedItems = items.slice(offset, offset + actualPageSize);
            
            return {
                items: paginatedItems,
                pagination: {
                    current_page: page,
                    page_size: actualPageSize,
                    total_count: totalCount,
                    total_pages: totalPages,
                    has_previous: page > 1,
                    has_next: page < totalPages,
                    config: paginationConfig
                }
            };
        } else {
            return items;
        }
    }

    async get(modulePath, id) {
        const config = await this.getModuleConfig(modulePath);
        
        if (config.storage_type === 'D1') {
            // Handle D1 storage
            if (!this.d1) {
                throw new Error(`D1 database not available for module "${modulePath}"`);
            }
            
            const tableName = config.storage_D1_table;
            const idField = config.id_field;
            if (!tableName || !idField) {
                throw new Error(`D1 table name or id field not specified for module "${modulePath}"`);
            }
            
            try {
                const stmt = this.d1.prepare(`SELECT * FROM ${tableName} WHERE ${idField} = ?`);
                const result = await stmt.bind(id).first();
                
                // Convert Unix timestamps back to date strings for editing
                if (result) {
                    return this._convertUnixToDateFields(result);
                }
                return result;
            } catch (error) {
                console.error(`D1 query error for table ${tableName}, id ${id}:`, error);
                throw new Error(`Failed to get record from D1 table ${tableName}: ${error.message}`);
            }
        }
        
        const { items } = await this._loadAndConvertData(config.data_file);
        if (!items) {
            throw new Error(`Data file "${config.data_file}" not found or is empty for module "${modulePath}".`);
        }
        
        const item = items.find(item => item[config.id_field] == id);
        if (item) {
            // Process date fields for editing (convert timestamps back to dates)
            return await this._processDateFieldsForEdit(item, config.label, false);
        }
        return item;
    }

    async update(modulePath, id, updates) {
        const config = await this.getModuleConfig(modulePath);
        
        if (config.storage_type === 'D1') {
            // Handle D1 storage
            const tableName = config.storage_D1_table;
            const idField = config.id_field;
            if (!tableName || !idField) {
                throw new Error(`D1 table name or id field not specified for module "${modulePath}"`);
            }
            
            // Get original item for hooks
            const originalItem = await this.get(modulePath, id);
            if (!originalItem) {
                throw new Error(`Item with ID ${id} not found in module ${modulePath}.`);
            }
            
            let processedUpdates = await this._runHook('beforeUpdate', modulePath, config, updates, originalItem);
            
            // Convert date fields to Unix milliseconds
            processedUpdates = this._convertDateFieldsToUnix(processedUpdates);
            
            // Update last_update_date automatically
            processedUpdates.last_update_date = Date.now();
            
            // Build update query dynamically - only use D1 columns
            const d1Columns = config.storage_D1_columns ? 
                config.storage_D1_columns.split(',').map(col => col.trim()) : 
                Object.keys(processedUpdates);
            
            const updateFields = Object.keys(processedUpdates)
                .filter(key => key !== idField && d1Columns.includes(key));
            
            if (updateFields.length === 0) {
                throw new Error('No valid D1 fields to update');
            }
            
            const setClause = updateFields.map(field => `${field} = ?`).join(', ');
            const values = updateFields.map(field => processedUpdates[field]);
            values.push(id); // for WHERE clause
            
            const stmt = this.d1.prepare(`UPDATE ${tableName} SET ${setClause} WHERE ${idField} = ?`);
            await stmt.bind(...values).run();
            
            // Get updated item (without date conversion for JSON storage)
            const stmt2 = this.d1.prepare(`SELECT * FROM ${tableName} WHERE ${idField} = ?`);
            const rawUpdatedItem = await stmt2.bind(id).first();
            
            // Update the JSON file if unique_file exists (store raw Unix timestamps)
            if (rawUpdatedItem && rawUpdatedItem.unique_file) {
                await this.r2.put(rawUpdatedItem.unique_file, JSON.stringify(rawUpdatedItem, null, 2), {
                    httpMetadata: { contentType: 'application/json' }
                });
            }
            
            await this._runHook('afterUpdate', modulePath, config, rawUpdatedItem, originalItem);
            return;
        }
        
        const { items, originalData } = await this._loadAndConvertData(config.data_file);

        const itemIndex = items.findIndex(item => item[config.id_field] == id);
        
        if (itemIndex === -1) {
            throw new Error(`Item with ID ${id} not found in module ${modulePath}.`);
        }

        const originalItem = { ...items[itemIndex] };
        let processedUpdates = await this._runHook('beforeUpdate', modulePath, config, updates, originalItem);

        // Process date fields for dynamic form validation
        processedUpdates = await this._processDateFieldsForSave(processedUpdates, config.label, false);

        items[itemIndex] = { ...items[itemIndex], ...processedUpdates };

        await this._writeData(config.data_file, items, originalData);

        await this._runHook('afterUpdate', modulePath, config, items[itemIndex], originalItem);
        
        // --- Start of Injected Post-Process Logic ---
        if (config.post_process_script === 'PostSystemformsProcess.js') {
            try {
                const item = items[itemIndex];
                if (item.form_definition_file && Array.isArray(item.details)) {
                    const formDefinitionFileName = item.form_definition_file.endsWith('.json')
                        ? item.form_definition_file
                        : `${item.form_definition_file}.json`;
                    
                    const formDefinition = {
                        fields: item.details.map(detail => {
                            const newField = {
                                name: detail.column_name || '',
                                label: detail.caption || '',
                                type: detail.input_type || 'text',
                                required: detail.required === 'Yes' || detail.required === true
                            };

                            // Temporary data repair logic
                            const dropdownFields = [
                                "required_flag", "hidden_flag", "search_flag", "order_flag", 
                                "check_box_display_flag", "update_allow_flag", "service_package_insert_flag",
                                "delete_space_between_words_flag", "custom_font_face_flag",
                                "override_default_values_flag", "ignore_blank_line_flag",
                                "convert_html_bracket", "convert_enter_to_br_flag",
                                "advanced_user_level_flag", "exclude_html_tags_flag", "active"
                            ];

                            if (newField.type === 'dropdown' && dropdownFields.includes(newField.name) && !newField.options) {
                                newField.options = ["Yes", "No"];
                            }
                            // End of temporary data repair logic

                            if (detail.options) {
                                newField.options = detail.options;
                            }
                            if (detail.lov_static) {
                                newField.lov_static = detail.lov_static;
                            }
                            return newField;
                        })
                    };
                    
                    await this.r2.put(formDefinitionFileName, JSON.stringify(formDefinition, null, 2));
                }
            } catch (error) {
                console.error('Error in injected PostSystemformsProcess logic:', error);
                throw new Error(`Failed to execute injected PostSystemformsProcess: ${error.message}`);
            }
        }
        // --- End of Injected Post-Process Logic ---
    }

    async updateDetail(modulePath, itemId, detailId, updates) {
        const config = await this.getModuleConfig(modulePath);
        const { items, originalData } = await this._loadAndConvertData(config.data_file);

        const item = items.find(i => i[config.id_field] == itemId);
        if (!item) {
            throw new Error(`Item with ID ${itemId} not found in module ${modulePath}.`);
        }

        const detailIdField = config.detail_id_field || 'form_detail_id';
        const detailIndex = item.details.findIndex(d => d[detailIdField] == detailId);
        if (detailIndex === -1) {
            throw new Error(`Detail item with ID ${detailId} not found.`);
        }

        const originalDetail = { ...item.details[detailIndex] };
        let processedUpdates = await this._runHook('beforeUpdateDetail', modulePath, config, updates, originalDetail, item);

        // Handle checkbox value - use dynamic form generation
        const formFields = await this.getFormFields(config.detail_form_definition_file, null, config.label, true);
        if (formFields && formFields.fields) {
            formFields.fields.forEach(field => {
                if (field.type === 'checkbox') {
                    processedUpdates[field.name] = processedUpdates[field.name] === 'Yes' ? 'Yes' : 'No';
                }
            });
        }

        item.details[detailIndex] = { ...item.details[detailIndex], ...processedUpdates };
        
        await this._writeData(config.data_file, items, originalData);

        await this._runHook('afterUpdateDetail', modulePath, config, item.details[detailIndex], item);
    }

    async _runHook(hookName, modulePath, config, ...args) {
        const hookStartTime = Date.now();
        console.log(`🔧 _runHook called: ${hookName} for module: ${modulePath}, has_hooks: ${config.has_hooks}`);
        
        if (config.has_hooks || config.hooks) {
            const moduleHooks = hooks[modulePath];
            console.log(`🔧 moduleHooks found for ${modulePath}:`, !!moduleHooks);
            
            if (moduleHooks && moduleHooks[hookName]) {
                console.log(`🔧 Executing hook: ${hookName} for ${modulePath}`);
                try {
                    const result = await moduleHooks[hookName](...args, this.env);
                    const hookEndTime = Date.now();
                    console.log(`🔧 ✅ Hook ${hookName} completed in ${hookEndTime - hookStartTime}ms`);
                    return result;
                } catch (error) {
                    console.error(`Error running hook "${hookName}" for module "${modulePath}":`, error);
                    throw new Error(`Hook execution failed: ${hookName}`);
                }
            } else {
                console.log(`🔧 Hook ${hookName} not found for module ${modulePath}`);
            }
        } else {
            console.log(`🔧 Module ${modulePath} has no hooks configured`);
        }
        return args[0];
    }

    async delete(modulePath, id) {
        const config = await this.getModuleConfig(modulePath);
        
        if (config.storage_type === 'D1') {
            // Handle D1 storage
            const tableName = config.storage_D1_table;
            const idField = config.id_field;
            if (!tableName || !idField) {
                throw new Error(`D1 table name or id field not specified for module "${modulePath}"`);
            }
            
            // Get the item to delete
            const itemToDelete = await this.get(modulePath, id);
            if (!itemToDelete) {
                throw new Error(`Item with ID ${id} not found in module ${modulePath}.`);
            }
            
            await this._runHook('beforeDelete', modulePath, config, itemToDelete);
            
            // Delete from D1 table
            const stmt = this.d1.prepare(`DELETE FROM ${tableName} WHERE ${idField} = ?`);
            await stmt.bind(id).run();
            
            // Delete the JSON file if unique_file exists
            if (itemToDelete.unique_file) {
                try {
                    await this.r2.delete(itemToDelete.unique_file);
                } catch (error) {
                    console.warn(`Failed to delete file ${itemToDelete.unique_file}:`, error.message);
                }
            }
            
            await this._runHook('afterDelete', modulePath, config, itemToDelete);
            return;
        }
        
        const { items, originalData } = await this._loadAndConvertData(config.data_file);
        const itemToDelete = items.find(item => item[config.id_field] == id);

        if (!itemToDelete) {
            throw new Error(`Item with ID ${id} not found in module ${modulePath}.`);
        }
        
        await this._runHook('beforeDelete', modulePath, config, itemToDelete);

        const updatedItems = items.filter(item => item[config.id_field] != id);

        if (updatedItems.length === items.length) {
            throw new Error(`Item with ID ${id} not found in module ${modulePath}.`);
        }

        await this._writeData(config.data_file, updatedItems, originalData);
        await this._runHook('afterDelete', modulePath, config, itemToDelete);
    }

    async deleteDetail(modulePath, itemId, detailId) {
        const config = await this.getModuleConfig(modulePath);
        const { items, originalData } = await this._loadAndConvertData(config.data_file);

        const item = items.find(i => i[config.id_field] == itemId);
        if (!item) {
            throw new Error(`Item with ID ${itemId} not found in module ${modulePath}.`);
        }

        const detailIdField = config.detail_id_field || 'form_detail_id';
        const detailToDelete = item.details.find(d => d[detailIdField] == detailId);
        if (!detailToDelete) {
            throw new Error(`Detail item with ID ${detailId} not found.`);
        }
        
        await this._runHook('beforeDeleteDetail', modulePath, config, detailToDelete, item);

        const initialDetailCount = item.details.length;
        item.details = item.details.filter(d => d[detailIdField] != detailId);

        if (item.details.length === initialDetailCount) {
            throw new Error(`Detail item with ID ${detailId} not found.`);
        }

        await this._writeData(config.data_file, items, originalData);
        
        await this._runHook('afterDeleteDetail', modulePath, config, detailToDelete, item);
    }

    async create(modulePath, data) {
        const startTime = Date.now();
        console.log(`🔧 ⚡ CREATE START: ${modulePath}`);
        
        const config = await this.getModuleConfig(modulePath);
        
        // Apply fast defaults first (bypasses hook for simple defaults)
        data = this._applyDefaults(modulePath, data);
        
        if (config.storage_type === 'D1') {
            // Handle D1 storage
            const tableName = config.storage_D1_table;
            const idField = config.id_field;
            if (!tableName || !idField) {
                throw new Error(`D1 table name or id field not specified for module "${modulePath}"`);
            }
            
            let processedData = await this._runHook('beforeCreate', modulePath, config, data);
            
            // Convert date fields to Unix milliseconds
            processedData = this._convertDateFieldsToUnix(processedData);
            
            // Generate new ID using optimized caching
            const newId = await this._getNextId(tableName, idField);
            processedData[config.id_field] = newId;
            
            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const dataFile = config.data_file.replace('{{UnixMiliSecondsTimeStamp}}', timestamp);
            processedData.unique_file = dataFile;
            
            // Add audit fields if not present (as Unix timestamps)
            if (!processedData.creation_date) {
                processedData.creation_date = Date.now();
            }
            if (!processedData.last_update_date) {
                processedData.last_update_date = Date.now();
            }
            
            // Build insert query dynamically - only use D1 columns
            const d1Columns = config.storage_D1_columns ? 
                config.storage_D1_columns.split(',').map(col => col.trim()) : 
                Object.keys(processedData);
            
            const fields = Object.keys(processedData).filter(key => d1Columns.includes(key));
            const placeholders = fields.map(() => '?').join(', ');
            const values = fields.map(field => processedData[field]);
            
            const stmt = this.d1.prepare(
                `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`
            );
            await stmt.bind(...values).run();
            
            // Fire-and-forget R2 write (don't block response)
            this._asyncR2Write(dataFile, processedData);
            
            // Run afterCreate hook
            await this._runHook('afterCreate', modulePath, config, processedData);
            
            const endTime = Date.now();
            console.log(`🔧 ✅ CREATE COMPLETE: ${modulePath} in ${endTime - startTime}ms`);
            return newId;
        }
        
        let processedData = await this._runHook('beforeCreate', modulePath, config, data);

        // Process date fields for dynamic form validation
        processedData = await this._processDateFieldsForSave(processedData, config.label, false);

        const { items, originalData } = await this._loadAndConvertData(config.data_file);

        // Generate a new ID
        const newId = items.length > 0 ? Math.max(...items.map(item => item[config.id_field] || 0)) + 1 : 1;
        processedData[config.id_field] = newId;

        // Initialize details array if module has details
        if (config.has_details && !processedData.details) {
            processedData.details = [];
        }

        items.push(processedData);
        await this._writeData(config.data_file, items, originalData);
        
        await this._runHook('afterCreate', modulePath, config, processedData);
        
        // --- Start of Injected Post-Process Logic ---
        if (config.post_process_script === 'PostSystemformsProcess.js') {
            try {
                if (data.form_definition_file && Array.isArray(data.details)) {
                    const formDefinitionFileName = data.form_definition_file.endsWith('.json')
                        ? data.form_definition_file
                        : `${data.form_definition_file}.json`;

                    const formDefinition = {
                        fields: data.details.map(detail => {
                            const newField = {
                                name: detail.column_name || '',
                                label: detail.caption || '',
                                type: detail.input_type || 'text',
                                required: detail.required === 'Yes' || detail.required === true
                            };
                            if (detail.options) {
                                newField.options = detail.options;
                            }
                            if (detail.lov_static) {
                                newField.lov_static = detail.lov_static;
                            }
                            return newField;
                        })
                    };
                    
                    await this.r2.put(formDefinitionFileName, JSON.stringify(formDefinition, null, 2));
                }
            } catch (error) {
                console.error('Error in injected PostSystemformsProcess logic:', error);
                throw new Error(`Failed to execute injected PostSystemformsProcess: ${error.message}`);
            }
        }
        // --- End of Injected Post-Process Logic ---
        
        return newId;
    }

    async createDetail(modulePath, itemId, detailData) {
        const config = await this.getModuleConfig(modulePath);
        const { items, originalData } = await this._loadAndConvertData(config.data_file);
    
        const item = items.find(i => i[config.id_field] == itemId);
        if (!item) {
            throw new Error(`Item with ID ${itemId} not found in module ${modulePath}.`);
        }
    
        if (!item.details) {
            item.details = [];
        }

        // Apply fast defaults first
        detailData = this._applyDefaults(modulePath, detailData, true);

        let processedDetailData = await this._runHook('beforeCreateDetail', modulePath, config, detailData, item);
    
        // Generate a new ID for the detail
        const detailIdField = config.detail_id_field || 'form_detail_id';
        const newDetailId = item.details.length > 0 ? Math.max(...item.details.map(d => d[detailIdField] || 0)) + 1 : 1;
        processedDetailData[detailIdField] = newDetailId;
    
        // Handle checkbox value - use dynamic form generation
        const formFields = await this.getFormFields(config.detail_form_definition_file, null, config.label, true);
        if (formFields && formFields.fields) {
            formFields.fields.forEach(field => {
                if (field.type === 'checkbox') {
                    processedDetailData[field.name] = processedDetailData[field.name] === 'Yes' ? 'Yes' : 'No';
                }
            });
        }
    
        item.details.push(processedDetailData);
        await this._writeData(config.data_file, items, originalData);

        await this._runHook('afterCreateDetail', modulePath, config, processedDetailData, item);
    }

    async getSingle(modulePath) {
        const config = await this.getModuleConfig(modulePath);
        if (config.storage_type !== 'single_object') {
            throw new Error(`Module ${modulePath} is not a single_object type.`);
        }
        const dataObject = await this.r2.get(config.data_file);
        if (!dataObject) {
            throw new Error(`Data file "${config.data_file}" not found in R2 bucket for module "${modulePath}".`);
        }
        return dataObject.json();
    }

    async getMultiple(modulePath) {
        const config = await this.getModuleConfig(modulePath);
        if (config.storage_type !== 'multiple') {
            throw new Error(`Module ${modulePath} is not a multiple type.`);
        }
        const data = {};
        for (const source of config.json_files) {
            const dataObject = await this.r2.get(source.file_path);
            if (!dataObject) {
                throw new Error(`Data file "${source.file_path}" not found in R2 bucket for module "${modulePath}".`);
            }
            data[source.name] = await dataObject.json();
        }
        return data;
    }

    async setupCORS() {
        try {
            // Load CORS configuration from R2
            const corsConfigObject = await this.r2.get('cors-config.json');
            
            if (!corsConfigObject) {
                // Try to create a default CORS configuration

                const defaultCorsConfig = {
                    "corsRules": [
                        {
                            "AllowedOrigins": ["*"],
                            "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
                            "AllowedHeaders": ["*"],
                            "ExposeHeaders": ["ETag", "Content-Length"],
                            "MaxAgeSeconds": 3600
                        }
                    ]
                };
                
                // Upload the default config to R2
                const httpMetadata = { contentType: 'application/json' };
                await this.r2.put('cors-config.json', JSON.stringify(defaultCorsConfig, null, 2), { httpMetadata });
                
                // Use the default config
                var corsConfig = defaultCorsConfig;
            } else {
                var corsConfig = await corsConfigObject.json();
            }
            
            // Try using S3 API for CORS configuration (alternative approach)
            const s3Client = new S3Client({
                region: 'auto',
                endpoint: `https://${this.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: this.env.R2_ACCESS_KEY_ID,
                    secretAccessKey: this.env.R2_SECRET_ACCESS_KEY,
                },
                forcePathStyle: true,
            });

            const corsConfiguration = {
                CORSRules: corsConfig.corsRules,
            };

            const command = new PutBucketCorsCommand({
                Bucket: this.env.R2_BUCKET_NAME,
                CORSConfiguration: corsConfiguration,
            });

            const response = await s3Client.send(command);
            return response;
            
        } catch (error) {
            console.error('Error setting up CORS:', error);
            
            // Fallback: Try Cloudflare API if CF_API_TOKEN is available
            if (this.env.CF_API_TOKEN) {
                try {
                    const corsConfigObject = await this.r2.get('cors-config.json');
                    const corsConfig = await corsConfigObject.json();
                    
                    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/r2/buckets/${this.env.R2_BUCKET_NAME}/cors`;
                    
                    const response = await fetch(apiUrl, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${this.env.CF_API_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(corsConfig.corsRules),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        return result;
                    }
                } catch (fallbackError) {
                    console.error('Fallback API also failed:', fallbackError);
                }
            }
            
            throw error;
        }
    }

    async generatePresignedUrl(fileName, contentType) {
        const s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${this.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: this.env.R2_ACCESS_KEY_ID,
                secretAccessKey: this.env.R2_SECRET_ACCESS_KEY,
            },
            forcePathStyle: true,
        });

        const objectKey = `${Date.now()}-${fileName}`;
        const command = new PutObjectCommand({
            Bucket: this.env.R2_BUCKET_NAME,
            Key: objectKey,
            ContentType: contentType,
        });
        
        // Generate the URL with the SDK
        const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600,
        });

        // Manually remove the checksum headers from the URL.
        // This is the critical step to prevent signature mismatch with browser PUTs.
        const url = new URL(signedUrl);
        url.searchParams.delete('x-amz-sdk-checksum-algorithm');
        url.searchParams.delete('x-amz-checksum-crc32');
        
        return { uploadUrl: url.toString(), objectKey };
    }

        async getFormFields(formDefinitionFile = null, formMasterId = null, moduleLabel = null, isDetailForm = false) {
        console.log(`🔍 getFormFields called with:`, {
            formDefinitionFile,
            formMasterId,
            moduleLabel,
            isDetailForm
        });

        // If formMasterId is provided, use dynamic form generation from sys-system-forms.json
        if (formMasterId) {
            console.log(`🎯 Using dynamic form generation with formMasterId: ${formMasterId}`);
            return await this.getFormDefinitionByMasterId(formMasterId);
        }

        // If moduleLabel is provided, use dynamic form generation by matching with form description
        if (moduleLabel) {
            console.log(`🎯 Using dynamic form generation with moduleLabel: ${moduleLabel}, isDetailForm: ${isDetailForm}`);
            return await this.getFormDefinitionByLabel(moduleLabel, isDetailForm);
        }

        // Fallback to static form definition file if provided (for backward compatibility)
        if (formDefinitionFile) {
            console.log(`📄 Falling back to static form definition file: ${formDefinitionFile}`);
            // Ensure the file has a .json extension
            const fileName = formDefinitionFile.endsWith('.json') ? formDefinitionFile : `${formDefinitionFile}.json`;

            // Check cache first
            const cacheKey = `form_def_${fileName}`;
            const cached = WORKER_CACHE.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                console.log(`📦 Returning cached form definition for: ${fileName}`);
                return cached.data;
            }

            // Cache miss or expired - fetch from R2
            const formObject = await this.r2.get(fileName);
            if (!formObject) {
                console.error(`❌ Form definition file not found: ${fileName}`);
                return null;
            }

            const formData = await formObject.json();

            // Cache the result
            WORKER_CACHE.set(cacheKey, {
                data: formData,
                timestamp: Date.now()
            });

            console.log(`✅ Loaded and cached form definition from file: ${fileName}`);
            return formData;
        }

        // No form definition found
        console.warn(`⚠️ No form definition found - all parameters were null/undefined`);
        return null;
    }
}


