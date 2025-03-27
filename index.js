import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Feed } from 'feed';
import axios from 'axios';
import * as cheerio from 'cheerio';
import glob from 'glob';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the output directory (where GitHub Pages will serve from)
const outputDir = path.join(__dirname, 'dist');

// Path to the artists directory
const artistsDir = path.join(__dirname, 'artists');

// Ensure the output directory exists
fs.ensureDirSync(outputDir);

// Ensure the artists directory exists
fs.ensureDirSync(artistsDir);

/**
 * Processes all artist JSON files in the artists directory
 * @returns {Promise<void>}
 */
async function processArtistFiles() {
  try {
    // Find all .json files in the artists directory and its subdirectories
    const jsonFiles = glob.sync('**/*.json', { cwd: artistsDir });
    
    if (jsonFiles.length === 0) {
      console.log('No artist JSON files found. Creating a default one...');
      
      // Create a default file if none exist
      const defaultArtistsFile = path.join(artistsDir, 'default.json');
      const defaultArtists = {
        title: "Default Artist Feed",
        description: "Default feed for artists",
        artists: [
          {
            name: "Example Artist",
            url: "https://example.com/artist/page"
          }
        ]
      };
      
      await fs.writeJson(defaultArtistsFile, defaultArtists, { spaces: 2 });
      console.log(`Created default artists file at: ${defaultArtistsFile}`);
      jsonFiles.push('default.json');
    }
    
    console.log(`Found ${jsonFiles.length} artist JSON file(s) to process`);
    
    // Process each JSON file and generate a feed for it
    for (const jsonFile of jsonFiles) {
      const fullPath = path.join(artistsDir, jsonFile);
      console.log(`Processing artist file: ${fullPath}`);
      
      try {
        await generateFeedForFile(jsonFile, fullPath);
      } catch (error) {
        console.error(`Error processing ${jsonFile}: ${error.message}`);
      }
    }
    
    // Create an index page that links to all feeds
    await createIndexPage(jsonFiles);
    
  } catch (error) {
    console.error('Error processing artist files:', error);
  }
}

/**
 * Generates a feed for a specific artist JSON file
 * @param {string} jsonFile - Relative path to the JSON file within the artists directory
 * @param {string} fullPath - Full path to the JSON file
 * @returns {Promise<void>}
 */
async function generateFeedForFile(jsonFile, fullPath) {
  try {
    // Determine the output file name based on the JSON file path
    const feedId = path.basename(jsonFile, '.json');
    const feedDirectory = path.dirname(jsonFile);
    const outputFeedDir = path.join(outputDir, feedDirectory);
    
    // Ensure the output directory structure exists
    fs.ensureDirSync(outputFeedDir);
    
    // Load the artist file
    const artistsData = await fs.readJson(fullPath);
    
    // Get feed metadata or use defaults
    const feedTitle = artistsData.title || `${feedId} RSS Feed`;
    const feedDescription = artistsData.description || `Latest releases from ${feedId}`;
    const artists = artistsData.artists || [];
    
    if (artists.length === 0) {
      console.log(`No artists found in ${jsonFile}, skipping`);
      return;
    }
    
    // Create a new feed
    const feed = new Feed({
      title: feedTitle,
      description: feedDescription,
      id: `https://github.com/user/artist-rss-feed-generator/${feedId}`,
      link: `https://github.com/user/artist-rss-feed-generator/${feedId}`,
      language: "en",
      copyright: `All rights reserved ${new Date().getFullYear()}`,
      updated: new Date(),
      generator: "Artist RSS Feed Generator"
    });
    
    // Process each artist and add their releases to the feed
    console.log(`Processing ${artists.length} artists in ${jsonFile}...`);
    
    let totalReleaseCount = 0;
    
    for (const artist of artists) {
      console.log(`Scraping releases for: ${artist.name}`);
      
      try {
        const releases = await scrapeArtistReleases(artist);
        
        // Filter out sample/example releases
        const realReleases = releases.filter(release => {
          if (
            release.title.includes("Sample") || 
            release.title.includes("Error Reading") || 
            release.title.includes("Example") || 
            release.title.includes("Demo")
          ) {
            console.log(`Filtering out sample release: ${release.title}`);
            return false;
          }
          
          if (
            release.url.includes("example.com") || 
            !release.url.includes(".")
          ) {
            console.log(`Filtering out release with example URL: ${release.url}`);
            return false;
          }
          
          return true;
        });
        
        // Add each real release to the feed
        for (const release of realReleases) {
          // Sanitize content for XML
          let safeDescription = (release.description || `New release by ${artist.name}`)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
          
          let safeTitle = (artist.name + ' - ' + release.title)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
          
          // When preparing URLs, make sure to escape equals signs
          let safeUrl = release.url
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/=/g, '%3D');
          
          let safeImageUrl = '';
          if (release.image) {
            safeImageUrl = release.image
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&apos;')
              .replace(/=/g, '%3D');
          }
          
          let safeArtistUrl = artist.url
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/=/g, '%3D');
          
          const enhancedDescription = release.image 
            ? `<p><img src="${safeImageUrl}" alt="${safeTitle}" style="max-width:100%;"></p>
               <p>${safeDescription}</p>`
            : safeDescription;
          
          try {
            feed.addItem({
              title: `${artist.name} - ${release.title}`,
              id: safeUrl,
              link: safeUrl,
              description: enhancedDescription,
              author: [
                {
                  name: artist.name,
                  link: safeArtistUrl
                }
              ],
              date: release.date || new Date(),
              image: release.image ? {
                url: safeImageUrl,
                title: safeTitle,
                link: safeUrl
              } : undefined
            });
          } catch (e) {
            console.error(`Error adding feed item ${artist.name} - ${release.title}: ${e.message}`);
          }
        }
        
        const filteredCount = releases.length - realReleases.length;
        totalReleaseCount += realReleases.length;
        
        console.log(`Added ${realReleases.length} releases for ${artist.name} (filtered ${filteredCount} sample/example releases)`);
      } catch (error) {
        console.error(`Error scraping ${artist.name}: ${error.message}`);
      }
    }
    
    console.log(`Total real releases count for ${jsonFile}: ${totalReleaseCount}`);
    console.log(`Total items added to feed: ${feed.items ? feed.items.length : 0}`);
    
    // Determine output file path
    const outputFile = path.join(outputFeedDir, `${feedId}-feed.xml`);
    
    // Generate and write the feed
    if (totalReleaseCount === 0) {
      console.log(`No actual releases found for ${jsonFile}. Creating minimal feed.`);
      
      // Create a minimal feed with a message
      const rssOutput = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>${feedTitle}</title>
    <description>${feedDescription}</description>
    <link>https://github.com/user/artist-rss-feed-generator</link>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <item>
      <title>No Releases Found</title>
      <link>https://github.com/user/artist-rss-feed-generator</link>
      <description>No releases were found for the configured artists. Please check your artists list.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid>https://github.com/user/artist-rss-feed-generator/no-releases-${Date.now()}</guid>
    </item>
  </channel>
</rss>`;
      
      await fs.writeFile(outputFile, rssOutput);
    } else {
      // Generate the RSS feed XML
      const rssOutput = feed.rss2();
      
      // Write the feed to the output directory
      await fs.writeFile(outputFile, rssOutput);
    }
    
    console.log(`Feed written to ${outputFile}`);
    
    // Create a feed-specific HTML page
    await createFeedInfoPage(jsonFile, feedId, feedTitle, feedDirectory, totalReleaseCount);
    
  } catch (error) {
    console.error(`Error generating feed for ${jsonFile}:`, error);
    throw error;
  }
}

/**
 * Create an HTML page for a specific feed
 */
async function createFeedInfoPage(jsonFile, feedId, feedTitle, feedDirectory, releaseCount) {
  const relativePath = path.join(feedDirectory, feedId);
  const htmlPath = path.join(outputDir, feedDirectory, `${feedId}.html`);
  
  // Create a simple HTML page for this feed
  const feedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${feedTitle} - RSS Feed</title>
  <style>
    :root {
      --bg-color: #121212;
      --text-color: #e4e4e4;
      --link-color: #90caf9;
      --secondary-bg: #1e1e1e;
      --accent-color: #bb86fc;
      --border-color: #333333;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: var(--bg-color);
      color: var(--text-color);
    }
    .container {
      margin-top: 40px;
    }
    h1, h2, h3 {
      color: var(--accent-color);
    }
    .feed-link {
      background-color: var(--secondary-bg);
      padding: 15px;
      border-radius: 5px;
      font-family: monospace;
      word-break: break-all;
      border: 1px solid var(--border-color);
    }
    .feed-link a {
      color: var(--link-color);
      text-decoration: none;
    }
    .feed-link a:hover {
      text-decoration: underline;
    }
    pre {
      background-color: var(--secondary-bg);
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
      border: 1px solid var(--border-color);
    }
    .back-link {
      margin-bottom: 20px;
    }
    .back-link a {
      color: var(--link-color);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="back-link">
      <a href="../index.html">← Back to All Feeds</a>
    </div>
    
    <h1>${feedTitle}</h1>
    <p>This feed contains releases from the artists configured in <code>${jsonFile}</code>.</p>
    
    <h2>Subscribe to this RSS Feed</h2>
    <div class="feed-link">
      <a href="./${feedId}-feed.xml">${feedId}-feed.xml</a>
    </div>
    
    <h3>Details</h3>
    <p>Feed ID: ${feedId}</p>
    <p>Number of releases: ${releaseCount}</p>
    <p>Last updated: ${
      (() => {
        const now = new Date();
        return now.toLocaleString();
      })()
    }</p>
    
    <footer>
      <p>Generated by <a href="https://github.com/blstrManx/bandcamp-rss">Bandcamp RSS Feed Generator</a></p>
    </footer>
  </div>
</body>
</html>`;
  
  await fs.writeFile(htmlPath, feedHtml);
  console.log(`Feed info page written to ${htmlPath}`);
}

/**
 * Create the main index page that links to all available feeds
 */
async function createIndexPage(jsonFiles) {
  // Prepare feed list
  let feedListHtml = '';
  
  for (const jsonFile of jsonFiles) {
    const feedId = path.basename(jsonFile, '.json');
    const feedDirectory = path.dirname(jsonFile);
    const relativePath = path.join(feedDirectory, feedId);
    
    // Try to read the JSON to get the title
    try {
      const fullPath = path.join(artistsDir, jsonFile);
      const artistsData = await fs.readJson(fullPath);
      const feedTitle = artistsData.title || `${feedId} RSS Feed`;
      
      feedListHtml += `
      <li class="feed-item">
        <a href="${relativePath}.html">${feedTitle}</a>
        <div class="feed-details">
          <span class="feed-id">${feedId}</span>
          <a href="${relativePath}-feed.xml" class="direct-link">Direct XML Link</a>
        </div>
      </li>`;
    } catch (error) {
      console.error(`Error reading feed info for ${jsonFile}:`, error);
      feedListHtml += `
      <li class="feed-item">
        <a href="${relativePath}.html">${feedId}</a>
        <div class="feed-details">
          <span class="feed-id">${feedId}</span>
          <a href="${relativePath}-feed.xml" class="direct-link">Direct XML Link</a>
        </div>
      </li>`;
    }
  }
  
  // Create the index HTML
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artist RSS Feed Generator</title>
  <style>
    :root {
      --bg-color: #121212;
      --text-color: #e4e4e4;
      --link-color: #90caf9;
      --secondary-bg: #1e1e1e;
      --accent-color: #bb86fc;
      --border-color: #333333;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: var(--bg-color);
      color: var(--text-color);
    }
    .container {
      margin-top: 40px;
    }
    h1, h2, h3 {
      color: var(--accent-color);
    }
    a {
      color: var(--link-color);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .feed-list {
      list-style: none;
      padding: 0;
    }
    .feed-item {
      background-color: var(--secondary-bg);
      margin-bottom: 15px;
      padding: 15px;
      border-radius: 5px;
      border: 1px solid var(--border-color);
    }
    .feed-item a {
      font-size: 1.2em;
      font-weight: bold;
    }
    .feed-details {
      margin-top: 8px;
      font-size: 0.9em;
      color: #aaa;
      display: flex;
      justify-content: space-between;
    }
    .direct-link {
      font-family: monospace;
    }
    pre {
      background-color: var(--secondary-bg);
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
      border: 1px solid var(--border-color);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Artist RSS Feed Generator</h1>
    <p>This page hosts automatically generated RSS feeds for the latest releases from your favorite artists.</p>
    
    <h2>Available Feeds</h2>
    <ul class="feed-list">
      ${feedListHtml}
    </ul>
    
    <h3>How to Use</h3>
    <p>Click on a feed to view details, or copy the direct XML link to add it to your favorite RSS reader.</p>
    
    <h3>Creating Custom Feeds</h3>
    <p>To create a new feed, add a JSON file to the 'artists' directory with the following format:</p>
    <pre>{
  "title": "Your Feed Title",
  "description": "Description of your feed",
  "artists": [
    {
      "name": "Artist Name",
      "url": "https://artist-bandcamp-url.com",
      "maxReleases": 5
    },
    {
      "name": "Another Artist",
      "url": "https://another-artist.bandcamp.com",
      "maxReleases": 3
    }
  ]
}</pre>
    
    <h3>Last Updated</h3>
    <p>These feeds were last updated on: ${
      (() => {
        const now = new Date();
        return now.toLocaleString();
      })()
    }</p>
    
    <footer>
      <p>Generated by <a href="https://github.com/blstrManx/bandcamp-rss">Bandcamp RSS Feed Generator</a></p>
    </footer>
  </div>
</body>
</html>`;
  
  await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);
  console.log(`Main index page written to ${path.join(outputDir, 'index.html')}`);
}

// Start the process
processArtistFiles().catch(error => {
  console.error('Error in main process:', error);
});