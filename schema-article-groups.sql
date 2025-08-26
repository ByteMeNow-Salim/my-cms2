-- Article Groups D1 Schema
-- High-performance article grouping tables for CMS

-- Main table for storing articles in groups
CREATE TABLE article_groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    article_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    
    -- Create composite index for ultra-fast lookups
    UNIQUE(group_name, article_id)
);

-- Index for fast group queries
CREATE INDEX idx_article_groups_group_name ON article_groups(group_name);
CREATE INDEX idx_article_groups_position ON article_groups(group_name, position);
CREATE INDEX idx_article_groups_article_id ON article_groups(article_id);

-- Group configuration table
CREATE TABLE group_config (
    group_name TEXT PRIMARY KEY,
    group_type TEXT NOT NULL,
    max_size INTEGER DEFAULT 25,
    criteria_field TEXT,
    criteria_value TEXT,
    criteria_operator TEXT DEFAULT 'equals',
    layout_file TEXT,
    active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Insert default group configurations based on sys-system-layouts.json
INSERT INTO group_config (group_name, group_type, max_size, criteria_field, criteria_value, criteria_operator, layout_file) VALUES

-- Highlight groups
('highlight1', 'highlight', 25, 'highlight1_flag', 'Yes', 'equals', 'highlight1.js'),
('highlight2', 'highlight', 25, 'highlight2_flag', 'Yes', 'equals', 'highlight2.js'),
('highlight3', 'highlight', 25, 'highlight3_flag', 'Yes', 'equals', 'highlight3.js'),
('highlight4', 'highlight', 25, 'highlight4_flag', 'Yes', 'equals', 'highlight4.js'),
('highlight5', 'highlight', 25, 'highlight5_flag', 'Yes', 'equals', 'highlight5.js'),
('highlight6', 'highlight', 25, 'highlight6_flag', 'Yes', 'equals', 'highlight6.js'),
('highlight7', 'highlight', 25, 'highlight7_flag', 'Yes', 'equals', 'highlight7.js'),
('highlight8', 'highlight', 25, 'highlight8_flag', 'Yes', 'equals', 'highlight8.js'),
('highlight9', 'highlight', 25, 'highlight9_flag', 'Yes', 'equals', 'highlight9.js'),

-- Menu-based groups
('sports-news', 'submenu', 25, 'sub_menu_id', '1', 'equals', 'sports-articles.js'),
('business-news', 'submenu', 25, 'sub_menu_id', '2', 'equals', 'business-articles.js'),
('politics-news', 'submenu', 25, 'sub_menu_id', '3', 'equals', 'politics-articles.js'),
('local-news', 'submenu', 25, 'sub_menu_id', '4', 'equals', 'local-articles.js'),

-- Menu group collections
('all-news', 'menu_group', 40, 'menu_id', '1', 'equals', 'news-mixed.js'),
('all-services', 'menu_group', 30, 'menu_id', '2', 'equals', 'services-all.js'),
('all-directory', 'menu_group', 25, 'menu_id', '3', 'equals', 'directory-all.js'),
('all-classifieds', 'menu_group', 35, 'menu_id', '4', 'equals', 'classifieds-all.js'),

-- Mixed groups
('latest-mixed', 'mixed', 50, 'active', 'Yes', 'equals', 'latest-mixed.js'),
('featured-mix', 'any_highlight', 35, 'any_highlight_flag', 'Yes', 'any_highlight', 'featured-mix.js'),
('recent-stories', 'recent', 30, 'issue_date', 'recent_24h', 'recent', 'top-stories.js');

-- Create trigger to auto-update timestamps
CREATE TRIGGER update_article_groups_timestamp 
AFTER UPDATE ON article_groups
BEGIN
    UPDATE article_groups SET updated_at = strftime('%s', 'now') * 1000 WHERE group_id = NEW.group_id;
END;

CREATE TRIGGER update_group_config_timestamp 
AFTER UPDATE ON group_config
BEGIN
    UPDATE group_config SET updated_at = strftime('%s', 'now') * 1000 WHERE group_name = NEW.group_name;
END;



