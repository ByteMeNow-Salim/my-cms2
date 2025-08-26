// test-articles-groups-fix.js
// Simple test to check if the enhanced ArticleHooks will work

// Mock environment for testing
const mockEnv = {
    D1: {
        prepare: (sql) => {
            console.log('📄 SQL Query:', sql);
            return {
                bind: (...params) => {
                    console.log('🔗 Parameters:', params);
                    return {
                        run: async () => {
                            console.log('✅ Query executed successfully');
                            return { success: true };
                        },
                        first: async () => {
                            // Simulate table existence check
                            if (sql.includes('sqlite_master')) {
                                if (sql.includes('articles_groups_layouts')) {
                                    return { name: 'articles_groups_layouts' }; // This table exists
                                } else {
                                    return null; // articles_groups table doesn't exist
                                }
                            }
                            return null;
                        }
                    };
                }
            };
        }
    }
};

// Mock article data
const mockArticleData = {
    article_id: 123,
    heading: 'Test Article',
    menu: 'News',
    body: 'This is a test article',
    highlight1_flag: 'Yes',
    highlight3_flag: 'Yes',
    highlight5_flag: 'No',
    active: 'Yes',
    creation_date: Date.now(),
    last_update_date: Date.now()
};

// Import the hook functions (simplified versions for testing)
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
    
    console.log(`🔧 Starting syncToArticlesGroups for article_id: ${articleId}, operation: ${operation}`);
    console.log(`🔧 Data keys available:`, Object.keys(data));
    
    try {
        // Check if the table exists
        const checkStmt = env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='articles_groups'`);
        const tableExists = await checkStmt.first();
        console.log(`🔧 articles_groups table exists:`, !!tableExists);
        
        if (!tableExists) {
            console.log('❌ articles_groups table does not exist - creating it dynamically');
            const createStmt = env.D1.prepare(`
                CREATE TABLE IF NOT EXISTS articles_groups (
                    article_id INTEGER,
                    issue_date INTEGER,
                    starting_date INTEGER,
                    ending_date INTEGER,
                    sub_menu_id INTEGER,
                    menu TEXT,
                    heading TEXT,
                    body TEXT,
                    picture_location TEXT,
                    picture2_location TEXT,
                    by_line TEXT,
                    highlight1_flag TEXT,
                    highlight2_flag TEXT,
                    highlight3_flag TEXT,
                    highlight4_flag TEXT,
                    highlight5_flag TEXT,
                    highlight6_flag TEXT,
                    highlight7_flag TEXT,
                    highlight8_flag TEXT,
                    highlight9_flag TEXT,
                    unique_file TEXT,
                    active TEXT,
                    created_by INTEGER,
                    creation_date INTEGER,
                    last_updated_by INTEGER,
                    last_update_date INTEGER
                )
            `);
            await createStmt.run();
            console.log('✅ Created articles_groups table dynamically');
        }
        
        if (operation === 'create') {
            const stmt = env.D1.prepare(`
                INSERT INTO articles_groups (
                    article_id, issue_date, starting_date, ending_date, sub_menu_id, menu, 
                    heading, body, picture_location, picture2_location, by_line,
                    highlight1_flag, highlight2_flag, highlight3_flag, highlight4_flag, highlight5_flag,
                    highlight6_flag, highlight7_flag, highlight8_flag, highlight9_flag,
                    unique_file, active, created_by, creation_date, last_updated_by, last_update_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            console.log(`🔧 Binding values for article_id: ${articleId}`);
            
            await stmt.bind(
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
                data.highlight1_flag || 'No',
                data.highlight2_flag || 'No',
                data.highlight3_flag || 'No',
                data.highlight4_flag || 'No',
                data.highlight5_flag || 'No',
                data.highlight6_flag || 'No',
                data.highlight7_flag || 'No',
                data.highlight8_flag || 'No',
                data.highlight9_flag || 'No',
                data.unique_file || '',
                data.active || 'Yes',
                data.created_by || null,
                data.creation_date || Date.now(),
                data.last_updated_by || null,
                data.last_update_date || Date.now()
            ).run();
            
            console.log(`✅ Created article_groups record for article_id: ${articleId}`);
        }
        
    } catch (error) {
        console.error(`❌ Error syncing to articles_groups for article ${articleId}:`, error);
        console.error(`❌ Error details:`, error.message);
    }
}

async function syncToArticlesGroupsLayouts(data, env, operation = 'create') {
    if (!env.D1) {
        console.warn('🔧 D1 database not available for articles_groups_layouts sync');
        return;
    }
    
    const articleId = data.article_id;
    if (!articleId) {
        console.warn('🔧 No article_id found in data for articles_groups_layouts sync');
        return;
    }
    
    console.log(`🔧 Starting syncToArticlesGroupsLayouts for article_id: ${articleId}, operation: ${operation}`);
    
    try {
        // Check if the table exists
        const checkStmt = env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='articles_groups_layouts'`);
        const tableExists = await checkStmt.first();
        console.log(`🔧 articles_groups_layouts table exists:`, !!tableExists);
        
        if (!tableExists) {
            console.log('❌ articles_groups_layouts table does not exist - creating it dynamically');
            const createStmt = env.D1.prepare(`
                CREATE TABLE IF NOT EXISTS articles_groups_layouts (
                    article_id INTEGER,
                    group_type TEXT
                )
            `);
            await createStmt.run();
            console.log('✅ Created articles_groups_layouts table dynamically');
        }
        
        // Delete existing layout records for this article
        const deleteStmt = env.D1.prepare('DELETE FROM articles_groups_layouts WHERE article_id = ?');
        await deleteStmt.bind(articleId).run();
        
        // Find all highlight flags that are set to "Yes" and create group_type entries
        const highlightFlags = [
            'highlight1_flag', 'highlight2_flag', 'highlight3_flag', 'highlight4_flag', 'highlight5_flag',
            'highlight6_flag', 'highlight7_flag', 'highlight8_flag', 'highlight9_flag'
        ];
        
        for (let i = 0; i < highlightFlags.length; i++) {
            const flagName = highlightFlags[i];
            const flagValue = data[flagName];
            
            if (flagValue === 'Yes') {
                const highlightNumber = i + 1;
                const groupType = `Highlight${highlightNumber}`;
                
                const insertStmt = env.D1.prepare(`
                    INSERT INTO articles_groups_layouts (article_id, group_type) 
                    VALUES (?, ?)
                `);
                
                await insertStmt.bind(articleId, groupType).run();
                console.log(`✅ Added group_type "${groupType}" for article_id: ${articleId}`);
            }
        }
        
        console.log(`✅ Synced articles_groups_layouts for article_id: ${articleId}`);
        
    } catch (error) {
        console.error(`❌ Error syncing to articles_groups_layouts for article ${articleId}:`, error);
        console.error(`❌ Error details:`, error.message);
    }
}

// Test the functions
async function runTest() {
    console.log('🧪 Testing ArticleHooks Enhanced Functionality');
    console.log('==============================================\n');
    
    console.log('📋 Test Article Data:');
    console.log(JSON.stringify(mockArticleData, null, 2));
    console.log('\n');
    
    console.log('🔧 Testing syncToArticlesGroups...\n');
    await syncToArticlesGroups(mockArticleData, mockEnv, 'create');
    
    console.log('\n🔧 Testing syncToArticlesGroupsLayouts...\n');
    await syncToArticlesGroupsLayouts(mockArticleData, mockEnv, 'create');
    
    console.log('\n🎉 Test Complete!');
    console.log('\n📝 Expected Results:');
    console.log('   ✅ articles_groups table should be created and populated');
    console.log('   ✅ articles_groups_layouts should have 2 records:');
    console.log('      - (123, "Highlight1")');
    console.log('      - (123, "Highlight3")');
}

runTest().catch(console.error);






