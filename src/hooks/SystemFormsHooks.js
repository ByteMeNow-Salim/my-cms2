// src/hooks/SystemFormsHooks.js

// Enhanced parser: supports both old and new LOVsystem syntax - NO HARDCODED VALUES
function parseLovSystemArgs(lovJsonExpr) {
    if (!lovJsonExpr || typeof lovJsonExpr !== 'string') return null;
    
    const match = lovJsonExpr.match(/LOVsystem\s*\(([^)]*)\)/i);
    if (!match) return null;
    
    const paramsString = match[1];
    let sourceFile, fieldNames, blankNew, blankEdit;
    
    // Check if it's the new named parameter syntax (contains = signs)
    if (paramsString.includes('=')) {
        // Enhanced syntax: file=x, fields={a,b}, order:Descending
        console.log(`🆕 SystemFormsHooks using enhanced syntax`);
        
        const params = {};
        
        // Split by commas but handle braces for fields={...}
        const paramParts = [];
        let current = '';
        let braceDepth = 0;
        
        for (let i = 0; i < paramsString.length; i++) {
            const char = paramsString[i];
            if (char === '{') braceDepth++;
            if (char === '}') braceDepth--;
            
            if (char === ',' && braceDepth === 0) {
                paramParts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) paramParts.push(current.trim());
        
        // Parse each parameter
        paramParts.forEach(part => {
            const [key, value] = part.split(/[:=]/).map(s => s.trim());
            if (key && value) {
                params[key.toLowerCase()] = value.replace(/^['"]|['"]$/g, '');
            }
        });
        
        sourceFile = params.file;
        
        // Parse fields - handle {field1,field2} syntax
        if (params.fields) {
            const fieldsStr = params.fields.replace(/^{|}$/g, ''); // Remove braces
            fieldNames = fieldsStr.split(',').map(f => f.trim());
        }
        
        // Parse boolean flags
        blankNew = /yes|true|1/i.test(params['first-row-blank-new'] || params['first_row_blank_new'] || '');
        blankEdit = /yes|true|1/i.test(params['first-row-blank-edit'] || params['first_row_blank_edit'] || '');
        
    } else {
        // Legacy syntax: positional parameters - NO DEFAULTS  
        console.log(`📜 SystemFormsHooks using legacy syntax`);
        const parts = paramsString.split(',').map(p => p.trim()).filter(Boolean);
        sourceFile = parts[0]?.replace(/^['"]|['"]$/g, '');
        fieldNames = parts[1] ? [parts[1].replace(/^['"]|['"]$/g, '')] : [];
        const flags = (parts.slice(2).join(',') || '').toLowerCase();
        
        blankNew = /first[-_ ]?row[-_ ]?blank[-_ ]?new\s*=\s*(yes|true|1)/i.test(flags);
        blankEdit = /first[-_ ]?row[-_ ]?blank[-_ ]?edit\s*=\s*(yes|true|1)/i.test(flags);
    }
    
    // Validate required parameters - NO HARDCODED FALLBACKS
    if (!sourceFile || !fieldNames || fieldNames.length === 0) {
        console.error('❌ SystemFormsHooks: Missing required parameters in LOVsystem:', { sourceFile, fieldNames });
        return null;
    }
    
    const includeBlank = blankNew || blankEdit;
    console.log(`✅ SystemFormsHooks parsed LOVsystem:`, { sourceFile, fieldNames, blankNew, blankEdit, includeBlank });
    
    return { sourceFile, fieldNames, includeBlank, blankNew, blankEdit };
}

// Generic LOVsystem() - builds dropdown options from a JSON source file and fields - NO HARDCODED VALUES
async function LOVsystem(env, argsOrExpr, isEditMode = false) {
    try {
        const args = typeof argsOrExpr === 'string' ? parseLovSystemArgs(argsOrExpr) : argsOrExpr;
        
        if (!args) {
            console.error('❌ LOVsystem: Invalid arguments');
            return '<option value="">Error: Invalid LOVsystem arguments</option>';
        }
        
        const { sourceFile, fieldNames } = args;
        
        // Determine if blank row should be included based on mode
        let includeBlank = false;
        if (args?.includeBlank) {
            includeBlank = true; // Legacy support
        } else if (isEditMode && args?.blankEdit) {
            includeBlank = true; // Edit mode with first-row-blank-edit=Yes
        } else if (!isEditMode && args?.blankNew) {
            includeBlank = true; // New mode with first-row-blank-new=Yes
        }

        console.log(`🔧 LOVsystem: file=${sourceFile}, fields=[${fieldNames.join(',')}], editMode=${isEditMode}, includeBlank=${includeBlank}`);

        const sourceObject = await env.R2.get(sourceFile);
        if (!sourceObject) {
            console.error(`${sourceFile} not found`);
            return '<option value="">Error: source not found</option>';
        }
        const data = await sourceObject.json();

        // Normalize arrays
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (Array.isArray(data.modules)) items = data.modules;
        else if (Array.isArray(data.items)) items = data.items;
        else if (data.headers && Array.isArray(data.rows)) {
            const headers = data.headers;
            items = data.rows.map(r => headers.reduce((o, h, i) => (o[h] = r[i], o), {}));
        }

        // Support nested field paths and multiple fields
        const getByPath = (obj, path) => {
            return String(path).split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
        };

        // Build display values from multiple fields (same as ViewService)
        let values = items
            .map(item => {
                if (fieldNames.length === 1) {
                    // Single field - use as before
                    return getByPath(item, fieldNames[0]);
                } else {
                    // Multiple fields - combine with " - "
                    const fieldValues = fieldNames
                        .map(fieldName => getByPath(item, fieldName))
                        .filter(val => val && String(val).trim() !== ''); // Remove empty parts
                    
                    return fieldValues.length > 0 ? fieldValues.join(' - ') : null;
                }
            })
            .filter(value => value && String(value).trim() !== '') // Remove empty/blank values
            .filter((value, index, arr) => arr.indexOf(value) === index); // Remove duplicates

        // Sort alphabetically (no hardcoded ordering here - that's for ViewService)
        values.sort((a, b) => String(a).localeCompare(String(b)));

        let options = values.map(v => `<option value="${v}">${v}</option>`).join('');
        if (includeBlank) {
            options = `<option value="">-- Select --</option>` + options;
        }
        
        console.log(`✅ Generated ${values.length + (includeBlank ? 1 : 0)} total options`);
        return options || '<option value="">No values</option>';
    } catch (error) {
        console.error('Error in LOVsystem():', error);
        return '<option value="">Error loading options</option>';
    }
}

// Removed legacy SystemFormsFiles() wrapper; using LOVsystem exclusively.

// This function validates that all <option> tags are properly closed.
function validateLovStatic(lovStatic) {
    if (!lovStatic || typeof lovStatic !== 'string') {
        return; // Not a string or empty, nothing to validate.
    }
    const openTags = (lovStatic.match(/<option>/g) || []).length;
    const closeTags = (lovStatic.match(/<\/option>/g) || []).length;

    if (openTags !== closeTags) {
        throw new Error(`Invalid HTML in 'List of Values (Static)'. Found ${openTags} opening <option> tags but ${closeTags} closing </option> tags. Please ensure all tags are properly closed.`);
    }
}

// This is the core logic that regenerates the form definition file.
async function regenerateFormDefinition(masterItem, env) {
    if (!masterItem || !masterItem.form_definition_file || !Array.isArray(masterItem.details)) {
        console.error('Invalid master item or details for form definition regeneration.');
        return;
    }

    const formDefinitionFileName = masterItem.form_definition_file;

    const formDefinition = {
        fields: await Promise.all(masterItem.details.map(async detail => {
            const inputType = detail.input_type || 'text';
            const field = {
                name: detail.column_name || '',
                label: detail.caption || '',
                type: inputType.toLowerCase() === 'memo' ? 'textarea' : 'text', // Default to text, override below
                required: detail.required === 'Yes' || detail.required === true
            };

            // Handle specific input types with enhanced attributes
            if (inputType === 'Memo') {
                field.type = 'textarea';
                
                // Add rows and cols attributes for textarea sizing
                if (detail.display_length && detail.display_length > 0) {
                    field.rows = detail.display_length;
                }
                if (detail.display_width && detail.display_width > 0) {
                    field.cols = detail.display_width;
                }
                
                // Set default values if not specified
                if (!field.rows) field.rows = 5;  // Default rows
                if (!field.cols) field.cols = 50; // Default cols
            } else if (inputType === 'Text') {
                field.type = 'text';
                
                // Add size and maxlength attributes for text inputs
                if (detail.display_length && detail.display_length > 0) {
                    field.size = String(detail.display_length);
                }
                if (detail.input_length && detail.input_length > 0) {
                    field.maxlength = String(detail.input_length);
                }
            } else if (inputType === 'Password') {
                field.type = 'password';
                
                // Add size and maxlength attributes for password inputs
                if (detail.display_length && detail.display_length > 0) {
                    field.size = String(detail.display_length);
                }
                if (detail.input_length && detail.input_length > 0) {
                    field.maxlength = String(detail.input_length);
                }
            } else if (inputType === 'Number' || inputType === 'Decimal' || inputType === 'NumberNegative' || inputType === 'DecimalNegative') {
                field.type = 'number';
                
                // Add min and max attributes for number inputs
                if (detail.value_minimum_number !== null && detail.value_minimum_number !== '') {
                    field.min = String(detail.value_minimum_number);
                }
                if (detail.value_maximum_number !== null && detail.value_maximum_number !== '') {
                    field.max = String(detail.value_maximum_number);
                }
                
                // Add step for decimal types
                if (inputType === 'Decimal' || inputType === 'DecimalNegative') {
                    field.step = 'any';
                }
            } else if (inputType === 'Date') {
                field.type = 'date';
                
                // Add min and max attributes for date inputs
                if (detail.value_minimum_date && detail.value_minimum_date !== '') {
                    field.min = detail.value_minimum_date;
                }
                if (detail.value_maximum_date && detail.value_maximum_date !== '') {
                    field.max = detail.value_maximum_date;
                }
            }

            // Handle lov_json - preserve it for dynamic processing in ViewService
            if (detail.lov_json) {
                field.lov_json = detail.lov_json;
                console.log(`📋 Preserved lov_json for field ${detail.column_name}: ${detail.lov_json}`);
                
                // If it contains LOVsystem, ensure it's marked as text type with lov_json
                if (/LOVsystem\s*\(/i.test(detail.lov_json)) {
                    field.type = 'text';
                    console.log(`🎯 Set type=text for LOVsystem field: ${detail.column_name}`);
                }
            }

            // Handle lov_static - convert to proper format and set type to text
            if (detail.lov_static) {
                field.type = 'text';
                field.lov_static = detail.lov_static;
                
                // Add size and maxlength for dropdown fields if available
                if (detail.display_length && detail.display_length > 0) {
                    field.size = String(detail.display_length);
                }
                if (detail.input_length && detail.input_length > 0) {
                    field.maxlength = String(detail.input_length);
                }
            }

            // Clean up undefined/null values and ensure proper types
            Object.keys(field).forEach(key => {
                if (field[key] === undefined || field[key] === null) {
                    delete field[key];
                } else if (['size', 'maxlength', 'min', 'max', 'rows', 'cols'].includes(key)) {
                    // Ensure these are strings as expected by the frontend
                    field[key] = String(field[key]);
                } else if (key === 'required') {
                    // Ensure required is always a boolean
                    field[key] = Boolean(field[key]);
                }
            });
            
            return field;
        }))
    };

    try {
        const jsonContent = JSON.stringify(formDefinition, null, 2);
        const httpMetadata = { 
            contentType: 'application/json',
            cacheControl: 'no-cache'
        };
        await env.R2.put(formDefinitionFileName, jsonContent, { httpMetadata });
        console.log(`Successfully regenerated form definition file: ${formDefinitionFileName}`);
        console.log(`Generated JSON content: ${jsonContent}`);
    } catch (error) {
        console.error(`Failed to regenerate form definition file: ${formDefinitionFileName}`, error);
    }
}

// These hooks will run before a detail item is created or updated to validate the data.
export async function beforeCreateDetail(detailData, masterItem, env) {
    if (detailData.lov_static) {
        validateLovStatic(detailData.lov_static);
    }
    return detailData;
}

export async function beforeUpdateDetail(updates, existingDetail, masterItem, env) {
    if (updates.lov_static) {
        validateLovStatic(updates.lov_static);
    }
    return updates;
}


// Function to invalidate system forms cache by calling the CRUDService method
async function invalidateSystemFormsCache(env) {
    try {
        // Import CRUDService dynamically to avoid circular imports
        const { CRUDService } = await import('../services/CRUDService.js');
        CRUDService.invalidateSystemFormsCache();
        console.log('🗑️ SystemFormsHooks: System forms cache invalidated');
    } catch (error) {
        console.error('❌ SystemFormsHooks: Failed to invalidate system forms cache:', error);
    }
}

// These hooks will be called after a detail item is created, updated, or deleted.
export async function afterCreateDetail(detailItem, masterItem, env) {
    await regenerateFormDefinition(masterItem, env);
    // Invalidate system forms cache to ensure fresh data is loaded
    await invalidateSystemFormsCache(env);
}

export async function afterUpdateDetail(updatedDetail, masterItem, env) {
    await regenerateFormDefinition(masterItem, env);
    // Invalidate system forms cache to ensure fresh data is loaded
    await invalidateSystemFormsCache(env);
}

export async function afterDeleteDetail(deletedDetail, masterItem, env) {
    await regenerateFormDefinition(masterItem, env);
    // Invalidate system forms cache to ensure fresh data is loaded
    await invalidateSystemFormsCache(env);
}

// Master-level hooks to handle changes to the sys-system-forms.json structure
export async function afterCreate(masterItem, env) {
    // Invalidate system forms cache when a new form is created
    await invalidateSystemFormsCache(env);
}

export async function afterUpdate(updatedItem, env) {
    // Invalidate system forms cache when a form is updated
    await invalidateSystemFormsCache(env);
}

export async function afterDelete(deletedItem, env) {
    // Invalidate system forms cache when a form is deleted
    await invalidateSystemFormsCache(env);
}
