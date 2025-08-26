#!/usr/bin/env node
// deploy-articles-groups.js
// Simple deployment script for articles groups functionality

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function setupTables() {
    console.log('🚀 Creating articles_groups table with ArticleGroup flags...');
    
    const tables = [
        // Create articles_groups table with ArticleGroup flags
        `CREATE TABLE IF NOT EXISTS articles_groups (
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
            articlegroup1_flag TEXT,
            articlegroup2_flag TEXT,
            articlegroup3_flag TEXT,
            articlegroup4_flag TEXT,
            articlegroup5_flag TEXT,
            articlegroup6_flag TEXT,
            articlegroup7_flag TEXT,
            articlegroup8_flag TEXT,
            articlegroup9_flag TEXT,
            unique_file TEXT,
            active TEXT,
            created_by INTEGER,
            creation_date INTEGER,
            last_updated_by INTEGER,
            last_update_date INTEGER
        )`,
        
        // Create indexes
        `CREATE INDEX IF NOT EXISTS idx_articles_groups_article_id ON articles_groups(article_id)`,
        `CREATE INDEX IF NOT EXISTS idx_articles_groups_active ON articles_groups(active)`,
        `CREATE INDEX IF NOT EXISTS idx_articles_groups_issue_date ON articles_groups(issue_date)`
    ];
    
    for (let i = 0; i < tables.length; i++) {
        try {
            console.log(`Creating table/index ${i + 1}/${tables.length}...`);
            await execAsync(`wrangler d1 execute cfsalim-com --command "${tables[i]}"`);
            console.log(`✅ Success`);
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log(`ℹ️  Already exists - skipping`);
            } else {
                console.error(`❌ Error:`, error.message);
            }
        }
    }
}

async function deploy() {
    console.log('\n🚀 Deploying to Cloudflare Workers...');
    try {
        const { stdout, stderr } = await execAsync('wrangler deploy');
        console.log(stdout);
        if (stderr) console.warn(stderr);
        console.log('✅ Deployment successful!');
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🎯 Articles Groups Setup & Deployment');
        console.log('====================================\n');
        
        await setupTables();
        await deploy();
        
        console.log('\n🎉 Setup and deployment complete!');
        console.log('\n📝 What was implemented:');
        console.log('   ✅ articles_groups table - mirrors main articles table with ArticleGroup flags');
        console.log('   ✅ ArticleHooks.js - handles CRUD sync operations');
        console.log('   ✅ Dynamic ArticleGroup flag processing based on sys-system-layouts.json');
        console.log('   ✅ All CRUD operations (create/update/delete) sync to articles_groups table');
        console.log('\n🧪 Test by:');
        console.log('   1. Creating a new article with highlight flags set to "Yes"');
        console.log('   2. Checking that articles_groups table is populated with ArticleGroup flags');
        console.log('   3. Updating an article and verifying sync');
        console.log('   4. Deleting an article and verifying cleanup');
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        process.exit(1);
    }
}

main();

