import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Feed } from 'feed';
import axios from 'axios';
import * as cheerio from 'cheerio'; // Fixed import syntax for cheerio

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the output directory (where GitHub Pages will serve from)
const outputDir = path.join(__dirname, 'dist');

// Ensure the output directory exists
fs.ensureDirSync(outputDir);

/**
 * Scrape releases from an artist page
 * @param {Object} artist - Artist object with name and url
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeArtistReleases(artist) {
  const { url } = artist;
  
  // Determine which scraper to use based on the URL
  if (url.includes('bandcamp.com')) {
    return scrapeBandcamp(url);
  } else if (url.includes('soundcloud.com')) {
    return scrapeSoundcloud(url);
  } else if (url.includes('spotify.com')) {
    return scrapeSpotify(url);
  } else {
    // For demo purposes, return a sample release
    return [{
      title: "Sample Release",
      url: "https://example.com/sample-release",
      date: new Date(),
      image: "",
      description: `Demo release for ${artist.name}`
    }];
  }
}

/**
 * Scrape releases from a Bandcamp artist page
 * @param {string} url - Bandcamp artist URL
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeBandcamp(url) {
  try {
    // First fetch the artist page to get all album links
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Get all album/track items from the page
    const albumItems = $('.music-grid-item');
    
    for (let i = 0; i < albumItems.length; i++) {
      const el = albumItems[i];
      const albumUrl = $(el).find('a').attr('href');
      const title = $(el).find('.title').text().trim();
      const imageUrl = $(el).find('img').attr('src') || '';
      const artistOverride = $(el).find('.artist-override').text().trim();
      
      // Make sure the URL is absolute
      const fullAlbumUrl = albumUrl.startsWith('http') ? albumUrl : 
                         (albumUrl.startsWith('/') ? new URL(albumUrl, url).toString() : `${url}${albumUrl}`);
      
      try {
        // Fetch the album page to get detailed info
        console.log(`Fetching album details from: ${fullAlbumUrl}`);
        const { data: albumData } = await axios.get(fullAlbumUrl);
        const albumPage = cheerio.load(albumData);
        
        // Look for the release date in the album metadata
        let releaseDate;
        
        // Try to find the release date in the tralbum data (embedded JSON)
        const scriptTags = albumPage('script[type="application/ld+json"]');
        let foundDate = false;
        
        scriptTags.each((_, script) => {
          if (foundDate) return;
          
          try {
            const jsonData = JSON.parse(albumPage(script).html());
            if (jsonData && jsonData.datePublished) {
              releaseDate = new Date(jsonData.datePublished);
              foundDate = true;
            }
          } catch (e) {
            // Continue if this script tag doesn't contain valid JSON
          }
        });
        
        // If we couldn't find date in JSON, look for it in the page content
        if (!foundDate) {
          // Look for the release date in the album credits section
          const creditsText = albumPage('.tralbumData.tralbum-credits').text();
          const releaseDateMatch = creditsText.match(/released\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
          
          if (releaseDateMatch && releaseDateMatch[1]) {
            releaseDate = new Date(releaseDateMatch[1]);
          } else {
            // Try another common format
            const altDateMatch = albumPage('.tralbumData.tralbum-about-release-date').text().trim();
            if (altDateMatch) {
              releaseDate = new Date(altDateMatch);
            }
          }
        }
        
        // If still no date found, try another selector specific to Bandcamp
        if (!releaseDate || isNaN(releaseDate.getTime())) {
          const dateElement = albumPage('meta[itemprop="datePublished"]');
          if (dateElement.length) {
            const dateContent = dateElement.attr('content');
            if (dateContent) {
              releaseDate = new Date(dateContent);
            }
          }
        }
        
        // Set description (might include album notes if available)
        let description = `New release by ${artistOverride || 'artist'}`;
        const albumNotes = albumPage('.tralbum-about').text().trim();
        if (albumNotes) {
          description = albumNotes.length > 300 ? 
                      albumNotes.substring(0, 297) + '...' : 
                      albumNotes;
        }
        
        // If we still don't have a date, use current date as fallback
        if (!releaseDate || isNaN(releaseDate.getTime())) {
          console.log(`Couldn't find release date for: ${title}. Using current date.`);
          releaseDate = new Date();
        }
        
        releases.push({
          title,
          url: fullAlbumUrl,
          date: releaseDate,
          image: imageUrl,
          description
        });
        
      } catch (albumError) {
        console.error(`Error fetching album details for ${title}: ${albumError.message}`);
        // Add with basic info and current date if album page fetch fails
        releases.push({
          title,
          url: fullAlbumUrl,
          date: new Date(),
          image: imageUrl,
          description: `New release by ${artistOverride || 'artist'}`
        });
      }
      
      // Add a small delay to avoid overloading the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return releases.length > 0 ? releases : [{
      title: "Sample Bandcamp Release",
      url: url,
      date: new Date(),
      image: "",
      description: "Demo release (no actual releases found)"
    }];
  } catch (error) {
    console.error(`Error scraping Bandcamp: ${error.message}`);
    return [{
      title: "Error Reading Bandcamp",
      url: url,
      date: new Date(),
      description: "Could not retrieve releases"
    }];
  }
}

/**
 * Scrape releases from a SoundCloud artist page
 * @param {string} url - SoundCloud artist URL
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeSoundcloud(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // SoundCloud-specific selectors for releases
    $('.soundList__item').each((i, el) => {
      const title = $(el).find('.soundTitle__title').text().trim();
      const releaseUrl = $(el).find('.soundTitle__title').attr('href');
      const imageUrl = $(el).find('.image__full').attr('src') || '';
      const dateText = $(el).find('.soundTitle__uploadTime').text().trim();
      
      // Parse date or use current date if not found
      let date;
      try {
        if (dateText) {
          date = new Date(dateText);
        } else {
          date = new Date();
        }
      } catch (e) {
        date = new Date();
      }

      if (title && releaseUrl) {
        releases.push({
          title,
          url: releaseUrl.startsWith('http') ? releaseUrl : `https://soundcloud.com${releaseUrl}`,
          date,
          image: imageUrl,
          description: `New track on SoundCloud`
        });
      }
    });

    return releases.length > 0 ? releases : [{
      title: "Sample SoundCloud Release",
      url: url,
      date: new Date(),
      image: "",
      description: "Demo release (no actual releases found)"
    }];
  } catch (error) {
    console.error(`Error scraping SoundCloud: ${error.message}`);
    return [{
      title: "Error Reading SoundCloud",
      url: url,
      date: new Date(),
      description: "Could not retrieve releases"
    }];
  }
}

/**
 * Scrape releases from a Spotify artist page
 * @param {string} url - Spotify artist URL
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeSpotify(url) {
  // For demo purposes, return a sample release
  return [{
    title: "Sample Spotify Release",
    url: url,
    date: new Date(),
    image: "",
    description: "Demo release (Spotify requires authentication)"
  }];
}

async function generateFeed() {
  try {
    // Read the artists.json file
    const artistsFile = path.join(__dirname, 'artists.json');
    console.log(`Reading artists from: ${artistsFile}`);
    
    let artistsData;
    try {
      artistsData = await fs.readJson(artistsFile);
    } catch (error) {
      console.error(`Error reading artists.json: ${error.message}`);
      // Create a default artists list for demo
      artistsData = {
        artists: [
          {
            name: "Example Artist",
            url: "https://example.com/artist/page"
          }
        ]
      };
    }
    
    const artists = artistsData.artists || [];

    if (artists.length === 0) {
      console.log('No artists found in artists.json, using a demo artist');
      artists.push({
        name: "Demo Artist",
        url: "https://example.com/demo"
      });
    }

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
        console.error(`Error scraping ${artist.name}: ${error.message}`);
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
  <title>Bandcamp RSS Feed Generator</title>
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
    <p>This feed was last updated on: ${
		  (() => {
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			const seconds = String(now.getSeconds()).padStart(2, '0');
			return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
		  })()
		}</p>
    
    <footer>
      <p>Generated by <a href="https://github.com/blstrManx/bandcamp-rss">Bandcamp RSS Feed Generator</a></p>
    </footer>
  </div>
</body>
</html>`;
    
    await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);
    console.log(`Index page written to ${path.join(outputDir, 'index.html')}`);

  } catch (error) {
    console.error('Error generating feed:', error);
    // Create minimal output files even if there's an error
    try {
      const outputDir = path.join(__dirname, 'dist');
      fs.ensureDirSync(outputDir);
      
      // Create a minimal RSS feed
      const minimalFeed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Artist Releases RSS Feed</title>
    <description>Latest releases from your favorite artists</description>
    <link>https://github.com/user/artist-rss-feed-generator</link>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <item>
      <title>Error Generating Feed</title>
      <link>https://github.com/user/artist-rss-feed-generator</link>
      <description>There was an error generating the feed. Please check the GitHub Actions logs.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid>https://github.com/user/artist-rss-feed-generator/error-${Date.now()}</guid>
    </item>
  </channel>
</rss>`;
      
      await fs.writeFile(path.join(outputDir, 'artists-feed.xml'), minimalFeed);
      
      // Create a minimal index.html
      const minimalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Artist RSS Feed (Error)</title>
</head>
<body>
  <h1>Error Generating Feed</h1>
  <p>There was an error generating the artist RSS feed. Please check the GitHub Actions logs.</p>
  <p>A minimal feed is still available at <a href="./artists-feed.xml">artists-feed.xml</a></p>
</body>
</html>`;
      
      await fs.writeFile(path.join(outputDir, 'index.html'), minimalHtml);
      console.log('Created minimal output files due to error');
    } catch (e) {
      console.error('Failed to create minimal output files:', e);
    }
  }
}

// Run the feed generator
generateFeed();