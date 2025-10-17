/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://roocode.com',
  generateRobotsTxt: true,
  generateIndexSitemap: false, // We don't need index sitemap for a small site
  changefreq: 'monthly',
  priority: 0.7,
  sitemapSize: 5000,
  exclude: [
    '/api/*',
    '/server-sitemap-index.xml',
    '/404',
    '/500',
    '/_not-found',
  ],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    additionalSitemaps: [
      // Add any additional sitemaps here if needed in the future
    ],
  },
  // Custom transform function to set specific priorities and change frequencies
  transform: async (config, path) => {
    // Set custom priority for specific pages
    let priority = config.priority;
    let changefreq = config.changefreq;
    
    if (path === '/') {
      priority = 1.0;
      changefreq = 'yearly';
    } else if (path === '/extension') {
      priority = 0.9;
      changefreq = 'monthly';
    } else if (path === '/cloud' || path === '/pricing') {
      priority = 0.8;
      changefreq = 'monthly';
    } else if (path === '/enterprise') {
      priority = 0.5;
      changefreq = 'yearly';
    } else if (path === '/evals') {
      priority = 0.6;
      changefreq = 'monthly';
    } else if (path === '/privacy' || path === '/terms') {
      priority = 0.5;
      changefreq = 'yearly';
    }
    
    return {
      loc: path,
      changefreq,
      priority,
      lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
      alternateRefs: config.alternateRefs ?? [],
    };
  },
  additionalPaths: async (config) => {
    // Explicitly include dynamic or non-file-system paths
    return [
      {
        loc: '/evals',
        changefreq: 'monthly',
        priority: 0.6,
        lastmod: new Date().toISOString(),
      },
      {
        loc: '/extension',
        changefreq: 'monthly',
        priority: 0.9,
        lastmod: new Date().toISOString(),
      },
    ];
  },
};