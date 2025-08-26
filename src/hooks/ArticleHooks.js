// src/hooks/ArticleHooks.js
// Hooks for Articles module to manage articles_groups and articles_groups_layouts tables
import { Article_layout_process } from './Article_layout_process.js';


// src/hooks/ArticleHooks.js
// Hooks for Articles module to manage articles_groups table with ArticleGroup flags

// Cache for sys-system-layouts.json to avoid R2 calls on every request
let layoutConfigCache = null;
let layoutCacheExpiry = 0;
const LAYOUT_CACHE_TTL = 300000; // 5 minutes in milliseconds

// Cache for table existence check
let tableExistsCache = null;
let tableCacheExpiry = 0;
const TABLE_CACHE_TTL = 600000; // 10 minutes

export async function beforeCreate(data, env) {
    console.log('🔧 ArticleHooks beforeCreate called with data:', JSON.stringify(data, null, 2));
    
    // Parse menu value and update menu_id and sub_menu_id
    await parseMenuValue(data, env);
    
    console.log('🔧 ArticleHooks beforeCreate finished with data:', JSON.stringify(data, null, 2));
    return data;
}

export async function afterCreate(data, env) {
    console.log('🔧 ArticleHooks afterCreate called for article:', data.article_id);
    
    try {
        await syncToArticlesGroups(data, env, 'create');

      // Call Article_layout_process with only 'env'
      await Article_layout_process(env);

    } catch (error) {
        console.error('Error in ArticleHooks afterCreate:', error);
        // Don't throw - allow the main article creation to complete
    }
    
    return data;
}

export async function beforeUpdate(updates, original, env) {
    console.log('🔧 ArticleHooks beforeUpdate called for article:', original.article_id);
    console.log('🔧 ArticleHooks beforeUpdate updates:', JSON.stringify(updates, null, 2));
    
    // Parse menu value and update menu_id and sub_menu_id
    await parseMenuValue(updates, env);
    
    console.log('🔧 ArticleHooks beforeUpdate finished with updates:', JSON.stringify(updates, null, 2));
    return updates;
}

export async function afterUpdate(updatedData, originalData, env) {
    console.log('🔧 ArticleHooks afterUpdate called for article:', updatedData.article_id);
    
    try {
        await syncToArticlesGroups(updatedData, env, 'update');

      // Call Article_layout_process with only 'env'
      await Article_layout_process(env);

    } catch (error) {
        console.error('Error in ArticleHooks afterUpdate:', error);
        // Don't throw - allow the main article update to complete
    }
    
    return updatedData;
}

export async function beforeDelete(data, env) {
    console.log('🔧 ArticleHooks beforeDelete called for article:', data.article_id);
    return data;
}

export async function afterDelete(data, env) {
    console.log('🔧 ArticleHooks afterDelete called for article:', data.article_id);
    
    try {
        await deleteFromArticlesGroups(data.article_id, env);
    } catch (error) {
        console.error('Error in ArticleHooks afterDelete:', error);
        // Don't throw - allow the main article deletion to complete
    }
    
    return data;
}

// Helper function to sync article data to articles_groups table
async function syncToArticlesGroups(data, env, operation = 'create') {
    if (!env.D1) {
        console.warn('🔧 D1 database not available for articles_groups sync');
        return;
    }
    
    const articleId = data.article_id;
    if (!articleId) {
        console.warn('🔧 No article_id found in data for articles_groups sync');
        return;
    }
    
    console.log(`🔧 ⚡ ${operation.toUpperCase()}: article_id ${articleId}`);
    
    try {
        // Load sys-system-layouts.json with caching to avoid R2 calls
        const layoutData = await getCachedLayoutConfig(env);
        const allActiveLayouts = layoutData.allActiveLayouts;
        const activeArticleGroups = layoutData.activeArticleGroups;
        
        // Check if the table exists (with caching)
        await ensureTableExists(env);
        
                       // Prepare flags for batch processing
               const flagsToCheck = [];
               const highlightFlags = {};
               const { layoutConfigMap } = layoutData;
               
               // Collect highlight flags that need limit checking (only check 'Yes' flags)
               for (let i = 1; i <= 9; i++) {
                   const flagName = `highlight${i}_flag`;
                   const layoutName = `Highlight${i}`;
                   const originalFlagValue = data[flagName] || 'No';
                   
                   if (originalFlagValue === 'Yes') {
                       const layout = layoutConfigMap.get(layoutName);
                       if (layout && layout.layout_limit > 0) {
                           flagsToCheck.push({ flagName, layout, type: 'highlight' });
                       } else {
                           highlightFlags[flagName] = 'Yes'; // No limit check needed
                       }
                   } else {
                       highlightFlags[flagName] = originalFlagValue; // Keep 'No' as-is
                   }
               }

               // Collect ArticleGroup flags that need limit checking
               const articleGroupFlags = {};
               for (let i = 1; i <= 9; i++) {
                   const flagName = `articlegroup${i}_flag`;
                   const layoutName = `ArticleGroup${i}`;
                   
                   const activeLayout = activeArticleGroups.find(layout => layout.layout_name === layoutName);
                   
                   if (activeLayout) {
                       let shouldInclude = false;
                       
                       // Check where_clause match
                       if (activeLayout.where_clause) {
                           shouldInclude = await checkArticleMatchesWhereClause(data, activeLayout.where_clause);
                       } else {
                           shouldInclude = true; // No where_clause = include all
                       }
                       
                       if (shouldInclude && activeLayout.layout_limit > 0) {
                           // Need to check limit
                           flagsToCheck.push({ flagName, layout: activeLayout, type: 'articlegroup' });
                       } else if (shouldInclude) {
                           // No limit check needed
                           articleGroupFlags[flagName] = 'Yes';
                       } else {
                           // Doesn't match where_clause
                           articleGroupFlags[flagName] = 'No';
                       }
                   } else {
                       // No active layout found
                       articleGroupFlags[flagName] = data[flagName] || 'No';
                   }
               }
               
               // Batch check all layout limits in one query
               if (flagsToCheck.length > 0) {
                   const limitResults = await checkMultipleLayoutLimits(env, flagsToCheck, articleId);
                   
                   // Apply limit check results
                   flagsToCheck.forEach(({ flagName, type }) => {
                       const result = limitResults.get(flagName);
                       if (result && result.withinLimit) {
                           if (type === 'highlight') {
                               highlightFlags[flagName] = 'Yes';
                           } else {
                               articleGroupFlags[flagName] = 'Yes';
                           }
                       } else {
                           if (type === 'highlight') {
                               highlightFlags[flagName] = 'No';
                           } else {
                               articleGroupFlags[flagName] = 'No';
                           }
                       }
                   });
                   
                   console.log(`🔧 ⚡ Batch processed ${flagsToCheck.length} flags`);
               }
        
        if (operation === 'create') {
            // Check if we should create the record (if any flags are 'Yes')
            const hasAnyHighlight = Object.values(highlightFlags).some(flag => flag === 'Yes');
            const hasAnyArticleGroup = Object.values(articleGroupFlags).some(flag => flag === 'Yes');
            
            // Simplified logging for performance
            console.log(`🔧 ⚡ CREATE: ${hasAnyHighlight ? 'H' : ''}${hasAnyArticleGroup ? 'AG' : ''} flags set for article ${articleId}`);
            
            if (!hasAnyHighlight && !hasAnyArticleGroup) {
                console.log(`🔧 ⚠️ No flags set to 'Yes' after layout_limit check - SKIPPING articles_groups creation for article_id: ${articleId}`);
                return; // Don't create the record
            }
            
            // Insert new record into articles_groups - 35 columns exactly
            const insertSQL = `
                INSERT INTO articles_groups (
                    article_id, issue_date, starting_date, ending_date, sub_menu_id, menu,
                    heading, body, picture_location, picture2_location, by_line,
                    highlight1_flag, highlight2_flag, highlight3_flag, highlight4_flag, highlight5_flag,
                    highlight6_flag, highlight7_flag, highlight8_flag, highlight9_flag,
                    articlegroup1_flag, articlegroup2_flag, articlegroup3_flag, articlegroup4_flag, articlegroup5_flag,
                    articlegroup6_flag, articlegroup7_flag, articlegroup8_flag, articlegroup9_flag,
                    unique_file, active, created_by, creation_date, last_updated_by, last_update_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            console.log(`🔧 INSERT SQL (35 columns):`, insertSQL);
            const stmt = env.D1.prepare(insertSQL);
            
            const values = [
                articleId,
                data.issue_date || null,
                data.starting_date || null,
                data.ending_date || null,
                data.sub_menu_id || null,
                data.menu || '',
                data.heading || '',
                data.body || '',
                data.picture_location || '',
                data.picture2_location || '',
                data.by_line || '',
                highlightFlags.highlight1_flag,
                highlightFlags.highlight2_flag,
                highlightFlags.highlight3_flag,
                highlightFlags.highlight4_flag,
                highlightFlags.highlight5_flag,
                highlightFlags.highlight6_flag,
                highlightFlags.highlight7_flag,
                highlightFlags.highlight8_flag,
                highlightFlags.highlight9_flag,
                articleGroupFlags.articlegroup1_flag,
                articleGroupFlags.articlegroup2_flag,
                articleGroupFlags.articlegroup3_flag,
                articleGroupFlags.articlegroup4_flag,
                articleGroupFlags.articlegroup5_flag,
                articleGroupFlags.articlegroup6_flag,
                articleGroupFlags.articlegroup7_flag,
                articleGroupFlags.articlegroup8_flag,
                articleGroupFlags.articlegroup9_flag,
                data.unique_file || '',
                data.active || 'Yes',
                data.created_by || null,
                data.creation_date || Date.now(),
                data.last_updated_by || null,
                data.last_update_date || Date.now()
            ];
            
            console.log(`🔧 Binding ${values.length} values for article_id: ${articleId}`);
            await stmt.bind(...values).run();
            console.log(`✅ Created articles_groups record for article_id: ${articleId}`);
            
        } else if (operation === 'update') {
            // Check if any highlight flags or active ArticleGroup layouts exist
            const hasAnyHighlight = Object.values(highlightFlags).some(flag => flag === 'Yes');
            const hasAnyArticleGroup = Object.values(articleGroupFlags).some(flag => flag === 'Yes');
            const hasActiveArticleGroups = activeArticleGroups.length > 0;
            
            // Simplified logging for performance  
            console.log(`🔧 ⚡ UPDATE: ${hasAnyHighlight ? 'H' : ''}${hasAnyArticleGroup ? 'AG' : ''} flags set for article ${articleId}`);
            
            const shouldProcessArticle = hasAnyHighlight || hasAnyArticleGroup;
            
            if (!shouldProcessArticle) {
                // No highlights and no active ArticleGroups - DELETE the record
                console.log(`🔧 No highlight flags or active ArticleGroups, deleting from articles_groups for article_id: ${articleId}`);
                const deleteStmt = env.D1.prepare(`DELETE FROM articles_groups WHERE article_id = ?`);
                await deleteStmt.bind(articleId).run();
                console.log(`✅ Deleted articles_groups record for article_id: ${articleId}`);
                
            } else {
                // Update or insert the record
                const checkStmt = env.D1.prepare(`SELECT article_id FROM articles_groups WHERE article_id = ?`);
                const existingRecord = await checkStmt.bind(articleId).first();
                
                if (existingRecord) {
                    // Record exists - Optimize UPDATE to only change flags + timestamp
                    console.log(`🔧 ⚡ Optimized UPDATE for article_id: ${articleId}`);
                    
                    // Build efficient update with only flags that matter
                    const updateFields = [];
                    const updateValues = [];
                    
                    // Always update timestamp
                    updateFields.push('last_update_date = ?');
                    updateValues.push(Date.now());
                    
                    // Add highlight flags
                    Object.entries(highlightFlags).forEach(([flagName, flagValue]) => {
                        updateFields.push(`${flagName} = ?`);
                        updateValues.push(flagValue);
                    });
                    
                    // Add articlegroup flags  
                    Object.entries(articleGroupFlags).forEach(([flagName, flagValue]) => {
                        updateFields.push(`${flagName} = ?`);
                        updateValues.push(flagValue);
                    });
                    
                    // Add article_id for WHERE clause
                    updateValues.push(articleId);
                    
                    const updateSQL = `UPDATE articles_groups SET ${updateFields.join(', ')} WHERE article_id = ?`;
                    
                    const stmt = env.D1.prepare(updateSQL);
                    console.log(`🔧 ⚡ UPDATE ${updateFields.length} fields for article_id: ${articleId}`);
                    await stmt.bind(...updateValues).run();
                    console.log(`✅ Optimized update completed for article_id: ${articleId}`);
                    
                } else {
                    // Record doesn't exist - INSERT it
                    console.log(`🔧 No existing record found, inserting new record for article_id: ${articleId}`);
                    const insertSQL = `
                        INSERT INTO articles_groups (
                            article_id, issue_date, starting_date, ending_date, sub_menu_id, menu,
                            heading, body, picture_location, picture2_location, by_line,
                            highlight1_flag, highlight2_flag, highlight3_flag, highlight4_flag, highlight5_flag,
                            highlight6_flag, highlight7_flag, highlight8_flag, highlight9_flag,
                            articlegroup1_flag, articlegroup2_flag, articlegroup3_flag, articlegroup4_flag, articlegroup5_flag,
                            articlegroup6_flag, articlegroup7_flag, articlegroup8_flag, articlegroup9_flag,
                            unique_file, active, created_by, creation_date, last_updated_by, last_update_date
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    const stmt = env.D1.prepare(insertSQL);
                    const values = [
                        articleId,
                        data.issue_date || null,
                        data.starting_date || null,
                        data.ending_date || null,
                        data.sub_menu_id || null,
                        data.menu || '',
                        data.heading || '',
                        data.body || '',
                        data.picture_location || '',
                        data.picture2_location || '',
                        data.by_line || '',
                        highlightFlags.highlight1_flag,
                        highlightFlags.highlight2_flag,
                        highlightFlags.highlight3_flag,
                        highlightFlags.highlight4_flag,
                        highlightFlags.highlight5_flag,
                        highlightFlags.highlight6_flag,
                        highlightFlags.highlight7_flag,
                        highlightFlags.highlight8_flag,
                        highlightFlags.highlight9_flag,
                        articleGroupFlags.articlegroup1_flag,
                        articleGroupFlags.articlegroup2_flag,
                        articleGroupFlags.articlegroup3_flag,
                        articleGroupFlags.articlegroup4_flag,
                        articleGroupFlags.articlegroup5_flag,
                        articleGroupFlags.articlegroup6_flag,
                        articleGroupFlags.articlegroup7_flag,
                        articleGroupFlags.articlegroup8_flag,
                        articleGroupFlags.articlegroup9_flag,
                        data.unique_file || '',
                        data.active || 'Yes',
                        data.created_by || null,
                        data.creation_date || Date.now(),
                        data.last_updated_by || null,
                        data.last_update_date || Date.now()
                    ];
                    
                    console.log(`🔧 INSERT with ${values.length} values for article_id: ${articleId}`);
                    await stmt.bind(...values).run();
                    console.log(`✅ Inserted new articles_groups record for article_id: ${articleId}`);
                }
            }
            
            // Count removed for performance - check logs if needed
        }
        
    } catch (error) {
        console.error(`❌ Error syncing to articles_groups for article ${articleId}:`, error);
        console.error(`❌ Error details:`, error.message);
        console.error(`❌ Error stack:`, error.stack);
        // Don't throw - allow main operation to continue
    }
}

// Cached table existence checker
async function ensureTableExists(env) {
    const now = Date.now();
    
    // Return cached result if still valid
    if (tableExistsCache && now < tableCacheExpiry) {
        return;
    }
    
    try {
        const checkStmt = env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='articles_groups'`);
        const tableExists = await checkStmt.first();
        
        if (!tableExists) {
            console.log('🔧 Creating articles_groups table...');
            const createStmt = env.D1.prepare(`
                CREATE TABLE IF NOT EXISTS articles_groups (
                    article_id INTEGER, issue_date INTEGER, starting_date INTEGER, ending_date INTEGER, sub_menu_id INTEGER,
                    menu TEXT, heading TEXT, body TEXT, picture_location TEXT, picture2_location TEXT, by_line TEXT,
                    highlight1_flag TEXT, highlight2_flag TEXT, highlight3_flag TEXT, highlight4_flag TEXT, highlight5_flag TEXT,
                    highlight6_flag TEXT, highlight7_flag TEXT, highlight8_flag TEXT, highlight9_flag TEXT,
                    articlegroup1_flag TEXT, articlegroup2_flag TEXT, articlegroup3_flag TEXT, articlegroup4_flag TEXT, articlegroup5_flag TEXT,
                    articlegroup6_flag TEXT, articlegroup7_flag TEXT, articlegroup8_flag TEXT, articlegroup9_flag TEXT,
                    unique_file TEXT, active TEXT, created_by INTEGER, creation_date INTEGER, last_updated_by INTEGER, last_update_date INTEGER
                )
            `);
            await createStmt.run();
            console.log('✅ Created articles_groups table');
        }
        
        // Cache the success
        tableExistsCache = true;
        tableCacheExpiry = now + TABLE_CACHE_TTL;
        
    } catch (error) {
        console.error('🔧 Error checking/creating articles_groups table:', error);
    }
}

// Cached layout config loader
async function getCachedLayoutConfig(env) {
    const now = Date.now();
    
    // Return cached data if still valid
    if (layoutConfigCache && now < layoutCacheExpiry) {
        return layoutConfigCache;
    }
    
    try {
        const layoutObject = await env.R2.get('sys-system-layouts.json');
        if (layoutObject) {
            const layoutConfig = await layoutObject.json();
            
            // Filter for all active layouts
            const allActiveLayouts = layoutConfig.filter(layout => 
                layout.active && layout.active.toLowerCase() === 'yes'
            );
            
            // Filter for active layouts with layout_name starting with "ArticleGroup"
            const activeArticleGroups = allActiveLayouts.filter(layout => 
                layout.layout_name && layout.layout_name.startsWith('ArticleGroup')
            );
            
            // Cache the result
            layoutConfigCache = {
                allActiveLayouts,
                activeArticleGroups,
                layoutConfigMap: new Map(allActiveLayouts.map(layout => [layout.layout_name, layout]))
            };
            layoutCacheExpiry = now + LAYOUT_CACHE_TTL;
            
            console.log(`🔧 ⚡ Layout config cached: ${activeArticleGroups.length} ArticleGroups, ${allActiveLayouts.length} total active`);
            return layoutConfigCache;
        }
    } catch (error) {
        console.warn('🔧 Could not load sys-system-layouts.json:', error.message);
    }
    
    // Return empty result on error
    return {
        allActiveLayouts: [],
        activeArticleGroups: [],
        layoutConfigMap: new Map()
    };
}

// Optimized batch layout limit checker
async function checkMultipleLayoutLimits(env, flagsToCheck, currentArticleId) {
    if (!env.D1 || flagsToCheck.length === 0) {
        return new Map(); // Return empty results
    }
    
    try {
        // Build a single query to get all counts at once
        const countQueries = flagsToCheck.map(({ flagName }) => 
            `SUM(CASE WHEN ${flagName} = 'Yes' AND article_id != ${currentArticleId} THEN 1 ELSE 0 END) as ${flagName}_count`
        ).join(', ');
        
        const batchCountSQL = `SELECT ${countQueries} FROM articles_groups`;
        const stmt = env.D1.prepare(batchCountSQL);
        
        const result = await stmt.first();
        
        // Convert results to Map
        const results = new Map();
        let deniedCount = 0;
        flagsToCheck.forEach(({ flagName, layout }) => {
            const count = result[`${flagName}_count`] || 0;
            const limit = layout.layout_limit || 0;
            const withinLimit = limit <= 0 || count < limit;
            results.set(flagName, { count, limit, withinLimit });
            if (!withinLimit) deniedCount++;
        });
        
        if (deniedCount > 0) {
            console.log(`🔧 ⚡ Batch check: ${deniedCount}/${flagsToCheck.length} flags denied due to limits`);
        }
        
        return results;
        
    } catch (error) {
        console.error('🔧 Error in batch layout limit check:', error);
        console.error('🔧 SQL was:', error.message);
        // Fallback to individual checks on error
        const results = new Map();
        for (const { flagName, layout } of flagsToCheck) {
            const shouldAllow = await checkLayoutLimit(env, flagName, layout, currentArticleId);
            results.set(flagName, { count: 0, limit: layout.layout_limit, withinLimit: shouldAllow });
        }
        return results;
    }
}

// Helper function to check if setting a flag to 'Yes' would exceed the layout_limit
async function checkLayoutLimit(env, flagName, activeLayout, currentArticleId) {
    if (!env.D1) {
        console.warn('🔧 D1 database not available for layout limit check');
        return true; // Allow if DB not available
    }
    
    const layoutLimit = activeLayout.layout_limit;
    if (!layoutLimit || layoutLimit <= 0) {
        console.log(`🔧 No layout_limit defined for ${activeLayout.layout_name}, allowing flag`);
        return true; // No limit defined
    }
    
    try {
        console.log(`🔧 Checking layout_limit: ${layoutLimit} for ${flagName}`);
        
        // Count current articles with this flag set to 'Yes' (excluding current article if updating)
        const countSQL = `SELECT COUNT(*) as count FROM articles_groups WHERE ${flagName} = 'Yes' AND article_id != ?`;
        const countStmt = env.D1.prepare(countSQL);
        const result = await countStmt.bind(currentArticleId).first();
        const currentCount = result?.count || 0;
        
        console.log(`🔧 Current count of articles with ${flagName}='Yes': ${currentCount}, limit: ${layoutLimit}`);
        
        if (currentCount < layoutLimit) {
            console.log(`🔧 ✅ Within limit: ${currentCount} < ${layoutLimit}, allowing flag`);
            return true;
        } else {
            console.log(`🔧 ❌ Limit exceeded: ${currentCount} >= ${layoutLimit}, DENYING flag to prevent exceeding limit`);
            return false;
        }
        
    } catch (error) {
        console.error(`🔧 Error checking layout limit for ${flagName}:`, error);
        return true; // Allow on error to avoid blocking articles
    }
}

// Helper function to check if an article matches a where_clause
async function checkArticleMatchesWhereClause(articleData, whereClause) {
    if (!whereClause || typeof whereClause !== 'string') {
        console.warn('🔧 Invalid where_clause provided');
        return false;
    }
    
    try {
        const trimmedClause = whereClause.trim().toLowerCase();
        
        // Handle "1=1" - always true (case insensitive)
        if (trimmedClause === "1=1" || trimmedClause === "where 1=1") {
            return true;
        }
        
        // Handle "0=1" - always false  
        if (trimmedClause === "0=1" || trimmedClause === "where 0=1") {
            return false;
        }
        
        // Handle simple equality checks like: menu='News - Local News'
        if (whereClause.includes("menu=")) {
            const match = whereClause.match(/menu\s*=\s*['"]([^'"]+)['"]/);
            if (match) {
                const expectedMenu = match[1];
                const articleMenu = articleData.menu || '';
                return articleMenu === expectedMenu;
            }
        }
        
        // Handle sub_menu_id checks like: sub_menu_id=301
        if (whereClause.includes("sub_menu_id=")) {
            const match = whereClause.match(/sub_menu_id\s*=\s*(\d+)/);
            if (match) {
                const expectedSubMenuId = parseInt(match[1]);
                const articleSubMenuId = parseInt(articleData.sub_menu_id) || 0;
                return articleSubMenuId === expectedSubMenuId;
            }
        }
        
        // Handle other simple field checks
        const simpleMatch = whereClause.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/);
        if (simpleMatch) {
            const fieldName = simpleMatch[1];
            const expectedValue = simpleMatch[2];
            const articleValue = articleData[fieldName] || '';
            return articleValue.toString() === expectedValue;
        }
        
        console.warn(`🔧 Unable to parse where_clause: ${whereClause}`);
        return false;
        
    } catch (error) {
        console.error(`❌ Error checking where_clause "${whereClause}":`, error);
        return false;
    }
}

// Helper function to delete records from articles_groups table
async function deleteFromArticlesGroups(articleId, env) {
    if (!env.D1) {
        console.warn('D1 database not available for articles_groups deletion');
        return;
    }
    
    try {
        const stmt = env.D1.prepare('DELETE FROM articles_groups WHERE article_id = ?');
        await stmt.bind(articleId).run();
        console.log(`✅ Deleted articles_groups record for article_id: ${articleId}`);
    } catch (error) {
        console.error(`Error deleting from articles_groups for article ${articleId}:`, error);
        throw error;
    }
}

// Helper function to parse concatenated menu value and update menu_id and sub_menu_id
async function parseMenuValue(data, env) {
    console.log('🔧 parseMenuValue called with data.menu:', data.menu, 'type:', typeof data.menu);
    
    if (!data.menu || typeof data.menu !== 'string') {
        console.log('🔧 No menu value to parse or menu is not a string');
        return;
    }
    
    const menuValue = data.menu.trim();
    console.log(`🔧 Parsing menu value: "${menuValue}"`);
    
    // Check if it's already in concatenated format (contains " - ")
    if (!menuValue.includes(' - ')) {
        console.log('🔧 Menu value is not in concatenated format, skipping parsing');
        return;
    }
    
    try {
        // Load sys-menus-lov.json from R2
        const lovFile = await env.R2.get('sys-menus-lov.json');
        if (!lovFile) {
            console.warn('🔧 sys-menus-lov.json not found, cannot parse menu value');
            return;
        }
        
        const lovData = await lovFile.json();
        console.log(`🔧 Loaded ${lovData.length} LOV records`);
        
        // Find matching record by concatenated menu value
        const matchingRecord = lovData.find(record => {
            const concatenatedValue = `${record.menu || ''} - ${record.sub_menu || ''}`;
            return concatenatedValue === menuValue;
        });
        
        if (matchingRecord) {
            console.log(`🔧 ✅ Found matching LOV record:`, matchingRecord);
            
            // Update the data with parsed values
            data.menu_id = matchingRecord.menu_id;
            data.sub_menu_id = matchingRecord.sub_menu_id;
            
            // Keep the original concatenated value in menu field for display
            console.log(`🔧 Updated menu_id: ${data.menu_id}, sub_menu_id: ${data.sub_menu_id}`);
        } else {
            console.warn(`🔧 ⚠️ No matching LOV record found for menu value: "${menuValue}"`);
        }
        
    } catch (error) {
        console.error('🔧 Error parsing menu value:', error);
        // Don't throw - allow the operation to continue
    }
}