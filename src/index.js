import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Feed } from 'feed';

// Use try/catch for detailed error logging
try {
  console.log('Starting RSS feed generation...');
  
  // Get the directory name
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  console.log(`Current directory: ${__dirname}`);

  // Path to the output directory (where GitHub Pages will serve from)
  const outputDir = path.join(__dirname, '..', 'dist');
  console.log(`Output directory: ${outputDir}`);

  // Ensure the output directory exists
  fs.ensureDirSync(outputDir);
  console.log('Created output directory');

  // Try importing the scraper (with error handling)
  let scrapeArtistReleases;
  try {
    const scraperModule = await import('./scraper.js');
    scrapeArtistReleases = scraperModule.scrapeArtistReleases;
    console.log('Successfully imported scraper module');
  } catch (error) {
    console.error('Error importing scraper module:', error);
    console.log('Directory contents:', fs.readdirSync(__dirname));
    // Create a placeholder function for testing
    scrapeArtistReleases = async () => {
      return [{ 
        title: 'Test Release', 
        url: 'https://example.com',
        description: 'This is a test release',
        date: new Date(),
        image: 'https://example.com/image.jpg'
      }];
    };
  }

  async function generateFeed() {
    try {
      // Read the artists.json file
      const artistsFile = path.join(__dirname, '..', 'artists.json');
      console.log(`Reading artists from: ${artistsFile}`);
      
      if (!fs.existsSync(artistsFile)) {
        console.error(`File not found: ${artistsFile}`);
        console.log('Current directory contents:', fs.readdirSync(path.join(__dirname, '..')));
        throw new Error('artists.json file not found');
      }

      const artistsData = await fs.readJson(artistsFile);
      const artists = artistsData.artists || [];

      if (artists.length === 0) {
        console.log('No artists found in artists.json');
        return;
      }

      console.log(`Found ${artists.length} artists`);

      // Create a new feed
      const feed = new Feed({
        title: "Artist Releases RSS Feed",
        description: "Latest releases from your favorite artists",
        id: "https://github.com/user/artist-rss-feed-generator",
        link: "https://github.com/user/artist-rss-feed-generator",
        language: "en",
        copyright: `All rights reserved ${new Date().getFullYear()}`,
        updated: new Date(),
        generator: "Artist RSS Feed Generator"
      });

      // Process each artist and add their releases to the feed
      console.log(`Processing ${artists.length} artists...`);
      
      for (const artist of artists) {
        console.log(`Scraping releases for: ${artist.name}`);
        
        try {
          const releases = await scrapeArtistReleases(artist);
          
          // Add each release to the feed
          for (const release of releases) {
            feed.addItem({
              title: `${artist.name} - ${release.title}`,
              id: release.url,
              link: release.url,
              description: release.description || `New release by ${artist.name}`,
              author: [
                {
                  name: artist.name,
                  link: artist.url
                }
              ],
              date: release.date || new Date()
            });
          }
          
          console.log(`Added ${releases.length} releases for ${artist.name}`);
        } catch (error) {
          console.error(`Error scraping ${artist.name}:`, error);
        }
      }

      // Generate the RSS feed XML
      const rssOutput = feed.rss2();
      
      // Write the feed to the output directory
      await fs.writeFile(path.join(outputDir, 'artists-feed.xml'), rssOutput);
      console.log(`RSS feed written to ${path.join(outputDir, 'artists-feed.xml')}`);
      
      // Create a simple index.html file
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artist RSS Feed Generator</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      margin-top: 40px;
    }
    h1 {
      margin-bottom: 20px;
    }
    .feed-link {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      font-family: monospace;
      word-break: break-all;
    }
    .feed-link a {
      color: #0366d6;
      text-decoration: none;
    }
    .feed-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Artist RSS Feed Generator</h1>
    <p>This page hosts an automatically generated RSS feed for the latest releases from your favorite artists.</p>
    
    <h2>Subscribe to the RSS Feed</h2>
    <div class="feed-link">
      <a href="./artists-feed.xml">artists-feed.xml</a>
    </div>
    
    <h3>How to Use</h3>
    <p>Copy the link above and add it to your favorite RSS reader to stay updated with new releases.</p>
    
    <h3>Last Updated</h3>
    <p>This feed was last updated on: ${new Date().toLocaleString()}</p>
    
    <footer>
      <p>Generated by <a href="https://github.com/user/artist-rss-feed-generator">Artist RSS Feed Generator</a></p>
    </footer>
  </div>
</body>
</html>`;
      
      await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);
      console.log(`Index page written to ${path.join(outputDir, 'index.html')}`);

    } catch (error) {
      console.error('Error generating feed:', error);
      process.exit(1);
    }
  }

  // Run the feed generator
  await generateFeed();
  console.log('Feed generation completed successfully');
  
} catch (error) {
  console.error('Fatal error during execution:', error);
  process.exit(1);
}