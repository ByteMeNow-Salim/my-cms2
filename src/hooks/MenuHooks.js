// src/hooks/MenuHooks.js
// Menu hooks for handling menu operations

import { LOVGeneratorService } from '../services/LOVGeneratorService.js';

export async function beforeCreate(data, env) {
    // Note: Most defaults are now handled synchronously by _applyDefaults()
    // Only add complex logic here if needed
    return data;
}

export async function afterCreate(data, env) {
    // Regenerate LOV file after creating new menu
    try {
        console.log('🔄 Menu created, regenerating LOV file...');
        const lovGenerator = new LOVGeneratorService(env);
        await lovGenerator.regenerateLOVForModule('Menus');
    } catch (error) {
        console.error('❌ Error regenerating LOV after menu creation:', error);
        // Don't throw error to avoid breaking the main operation
    }
    
    return data;
}

export async function beforeUpdate(updates, originalItem, env) {
    
    // Preserve details if not provided in updates
    if (!updates.details && originalItem.details) {
        updates.details = originalItem.details;
    }
    
    return updates;
}

export async function afterUpdate(updatedItem, originalItem, env) {
    // Regenerate LOV file after updating menu
    try {
        console.log('🔄 Menu updated, regenerating LOV file...');
        const lovGenerator = new LOVGeneratorService(env);
        await lovGenerator.regenerateLOVForModule('Menus');
    } catch (error) {
        console.error('❌ Error regenerating LOV after menu update:', error);
        // Don't throw error to avoid breaking the main operation
    }
    
    return updatedItem;
}

export async function beforeDelete(item, env) {
    return item;
}

export async function afterDelete(item, env) {
    // Regenerate LOV file after deleting menu
    try {
        console.log('🔄 Menu deleted, regenerating LOV file...');
        const lovGenerator = new LOVGeneratorService(env);
        await lovGenerator.regenerateLOVForModule('Menus');
    } catch (error) {
        console.error('❌ Error regenerating LOV after menu deletion:', error);
        // Don't throw error to avoid breaking the main operation
    }
    
    return item;
}

// Detail hooks for sub-menus
export async function beforeCreateDetail(detailData, parentItem, env) {
    // Note: Most defaults are now handled synchronously by _applyDefaults()
    // Only add complex logic here if needed
    return detailData;
}

export async function afterCreateDetail(detailData, parentItem, env) {
    // Regenerate LOV file after creating new sub-menu
    try {
        console.log('🔄 Sub-menu created, regenerating LOV file...');
        const lovGenerator = new LOVGeneratorService(env);
        await lovGenerator.regenerateLOVForModule('Menus');
    } catch (error) {
        console.error('❌ Error regenerating LOV after sub-menu creation:', error);
    }
    
    return detailData;
}

export async function beforeUpdateDetail(updates, originalDetail, parentItem, env) {
    return updates;
}

export async function afterUpdateDetail(updatedDetail, parentItem, env) {
    // Regenerate LOV file after updating sub-menu
    try {
        console.log('🔄 Sub-menu updated, regenerating LOV file...');
        const lovGenerator = new LOVGeneratorService(env);
        await lovGenerator.regenerateLOVForModule('Menus');
    } catch (error) {
        console.error('❌ Error regenerating LOV after sub-menu update:', error);
    }
    
    return updatedDetail;
}

export async function beforeDeleteDetail(detail, parentItem, env) {
    return detail;
}

export async function afterDeleteDetail(detail, parentItem, env) {
    // Regenerate LOV file after deleting sub-menu
    try {
        console.log('🔄 Sub-menu deleted, regenerating LOV file...');
        const lovGenerator = new LOVGeneratorService(env);
        await lovGenerator.regenerateLOVForModule('Menus');
    } catch (error) {
        console.error('❌ Error regenerating LOV after sub-menu deletion:', error);
    }
    
    return detail;
}


