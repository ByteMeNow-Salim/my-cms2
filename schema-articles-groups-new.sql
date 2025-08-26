-- Article Groups and Layout Management Schema
-- This schema handles dynamic grouping and layouts for articles

-- Table 1: articles_groups - Main article data mirrored from articles table with ArticleGroup flags
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
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_articles_groups_article_id ON articles_groups(article_id);
CREATE INDEX IF NOT EXISTS idx_articles_groups_active ON articles_groups(active);
CREATE INDEX IF NOT EXISTS idx_articles_groups_issue_date ON articles_groups(issue_date);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight1 ON articles_groups(highlight1_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight2 ON articles_groups(highlight2_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight3 ON articles_groups(highlight3_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight4 ON articles_groups(highlight4_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight5 ON articles_groups(highlight5_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight6 ON articles_groups(highlight6_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight7 ON articles_groups(highlight7_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight8 ON articles_groups(highlight8_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_highlight9 ON articles_groups(highlight9_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup1 ON articles_groups(articlegroup1_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup2 ON articles_groups(articlegroup2_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup3 ON articles_groups(articlegroup3_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup4 ON articles_groups(articlegroup4_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup5 ON articles_groups(articlegroup5_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup6 ON articles_groups(articlegroup6_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup7 ON articles_groups(articlegroup7_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup8 ON articles_groups(articlegroup8_flag);
CREATE INDEX IF NOT EXISTS idx_articles_groups_articlegroup9 ON articles_groups(articlegroup9_flag);

