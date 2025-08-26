// ArticleGroupManager.js - Core article group management functions

export class ArticleGroupManager {
  constructor(env) {
    this.env = env;
    this.r2 = env.R2;
    this.configCache = null;
    this.configCacheTime = 0;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  // Load configuration with caching
  async getConfig() {
    const now = Date.now();
    if (this.configCache && (now - this.configCacheTime) < this.CACHE_TTL) {
      return this.configCache;
    }

    const configFile = await this.r2.get('article-groups-config.json');
    if (!configFile) {
      throw new Error('Article groups configuration not found');
    }

    this.configCache = await configFile.json();
    this.configCacheTime = now;
    return this.configCache;
  }

  // Get article group from R2
  async getArticleGroup(groupName) {
    const config = await this.getConfig();
    const groupConfig = config.groups[groupName];
    
    if (!groupConfig) {
      throw new Error(`Group ${groupName} not found in configuration`);
    }

    const groupFile = await this.r2.get(groupConfig.file_name);
    if (!groupFile) {
      // Return empty group structure if file doesn't exist
      return {
        group_name: groupName,
        group_type: groupConfig.type,
        max_size: groupConfig.max_size,
        description: `Auto-generated group for ${groupName}`,
        last_updated: Date.now(),
        update_criteria: groupConfig.criteria,
        articles: []
      };
    }

    return await groupFile.json();
  }

  // Update article group with new article
  async updateArticleGroup(groupName, newArticle) {
    const config = await this.getConfig();
    const groupConfig = config.groups[groupName];
    
    if (!groupConfig) {
      console.warn(`Group ${groupName} not found in configuration`);
      return;
    }

    // Check if article meets criteria for this group
    if (!this.articleMeetsCriteria(newArticle, groupConfig.criteria)) {
      return;
    }

    // Load current group
    const group = await this.getArticleGroup(groupName);

    // Remove article if it already exists (for updates)
    group.articles = group.articles.filter(article => 
      article.article_id !== newArticle.article_id
    );

    // Add new article at position 1
    group.articles.unshift({
      ...newArticle,
      position: 1
    });

    // Update positions and trim to max size
    group.articles = group.articles
      .map((article, index) => ({ ...article, position: index + 1 }))
      .slice(0, group.max_size);

    group.last_updated = Date.now();

    // Write back to R2
    await this.r2.put(groupConfig.file_name, JSON.stringify(group, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });

    console.log(`Updated group ${groupName}: ${group.articles.length} articles`);
  }

  // Remove article from group
  async removeArticleFromGroup(groupName, articleId) {
    const config = await this.getConfig();
    const groupConfig = config.groups[groupName];
    
    if (!groupConfig) {
      return;
    }

    const group = await this.getArticleGroup(groupName);

    // Remove the article
    const originalLength = group.articles.length;
    group.articles = group.articles.filter(article => 
      article.article_id !== articleId
    );

    // If article was removed, update positions
    if (group.articles.length < originalLength) {
      group.articles = group.articles.map((article, index) => ({
        ...article,
        position: index + 1
      }));

      group.last_updated = Date.now();

      // Write back to R2
      await this.r2.put(groupConfig.file_name, JSON.stringify(group, null, 2), {
        httpMetadata: { contentType: 'application/json' }
      });

      console.log(`Removed article ${articleId} from group ${groupName}`);
    }
  }

  // Check if article meets group criteria
  articleMeetsCriteria(article, criteria) {
    const fieldValue = article[criteria.field];
    
    switch (criteria.operator) {
      case 'starts_with':
        return fieldValue && fieldValue.startsWith(criteria.value);
      case 'equals':
      default:
        return fieldValue === criteria.value;
    }
  }

  // Get all groups that an article should belong to
  async getGroupsForArticle(article) {
    const config = await this.getConfig();
    const eligibleGroups = [];

    for (const [groupName, groupConfig] of Object.entries(config.groups)) {
      if (this.articleMeetsCriteria(article, groupConfig.criteria)) {
        eligibleGroups.push(groupName);
      }
    }

    return eligibleGroups;
  }

  // Update all relevant groups for an article
  async updateAllGroupsForArticle(article) {
    const eligibleGroups = await this.getGroupsForArticle(article);
    
    // Update all eligible groups in parallel
    const updatePromises = eligibleGroups.map(groupName => 
      this.updateArticleGroup(groupName, article)
    );

    await Promise.all(updatePromises);
    
    console.log(`Updated ${eligibleGroups.length} groups for article ${article.article_id}`);
    return eligibleGroups;
  }

  // Remove article from all groups
  async removeArticleFromAllGroups(articleId) {
    const config = await this.getConfig();
    
    // Remove from all groups in parallel
    const removePromises = Object.keys(config.groups).map(groupName => 
      this.removeArticleFromGroup(groupName, articleId)
    );

    await Promise.all(removePromises);
    
    console.log(`Removed article ${articleId} from all groups`);
  }

  // Get affected layouts for an article change
  async getAffectedLayouts(article, originalArticle = null) {
    const config = await this.getConfig();
    const affectedLayouts = new Set();

    // Check current article groups
    const currentGroups = await this.getGroupsForArticle(article);
    
    // Check original article groups (for updates/deletes)
    let originalGroups = [];
    if (originalArticle) {
      originalGroups = await this.getGroupsForArticle(originalArticle);
    }

    // Combine all affected groups
    const allAffectedGroups = [...new Set([...currentGroups, ...originalGroups])];

    // Get layout dependencies
    for (const groupName of allAffectedGroups) {
      const groupConfig = config.groups[groupName];
      if (groupConfig && groupConfig.layout_dependencies) {
        groupConfig.layout_dependencies.forEach(layout => 
          affectedLayouts.add(layout)
        );
      }
    }

    return Array.from(affectedLayouts);
  }

  // Rebuild all groups from main articles table (maintenance function)
  async rebuildAllGroups() {
    console.log('Starting rebuild of all article groups...');
    
    const config = await this.getConfig();
    
    // Get all active articles from D1
    const allArticles = await this.env.D1.prepare(`
      SELECT * FROM articles 
      WHERE Active = 'Yes' 
      ORDER BY issue_date DESC
    `).all();

    // Rebuild each group
    for (const [groupName, groupConfig] of Object.entries(config.groups)) {
      const eligibleArticles = allArticles.results
        .filter(article => this.articleMeetsCriteria(article, groupConfig.criteria))
        .slice(0, groupConfig.max_size)
        .map((article, index) => ({ ...article, position: index + 1 }));

      const group = {
        group_name: groupName,
        group_type: groupConfig.type,
        max_size: groupConfig.max_size,
        description: `Rebuilt group for ${groupName}`,
        last_updated: Date.now(),
        update_criteria: groupConfig.criteria,
        articles: eligibleArticles
      };

      await this.r2.put(groupConfig.file_name, JSON.stringify(group, null, 2), {
        httpMetadata: { contentType: 'application/json' }
      });

      console.log(`Rebuilt group ${groupName}: ${eligibleArticles.length} articles`);
    }

    console.log('Completed rebuild of all article groups');
  }
}



