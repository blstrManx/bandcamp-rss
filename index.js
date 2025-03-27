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

    // Get album/track items from the page - limit to 2 most recent
    const albumItems = $('.music-grid-item');
    const itemCount = Math.min(albumItems.length, 2); // Only process the first 2 items
    
    console.log(`Found ${albumItems.length} releases, processing first ${itemCount}`);
    
    for (let i = 0; i < itemCount; i++) {
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
          const creditsElement = albumPage('.tralbumData.tralbum-credits');
          if (creditsElement.length) {
            const creditsText = creditsElement.text();
            console.log(`Credits text found: "${creditsText}"`);
            
            // Look specifically for "released Month Day, Year" format
            const releaseDateMatch = creditsText.match(/released\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
            
            if (releaseDateMatch && releaseDateMatch[1]) {
              console.log(`Release date match found: "${releaseDateMatch[1]}"`);
              releaseDate = new Date(releaseDateMatch[1]);
              console.log(`Parsed date: ${releaseDate.toISOString()}`);
              foundDate = true;
            }
          }
          
          // If still not found, try other selectors
          if (!foundDate) {
            // Try another common format
            const altDateElement = albumPage('.tralbumData.tralbum-about-release-date');
            if (altDateElement.length) {
              const altDateMatch = altDateElement.text().trim();
              if (altDateMatch) {
                releaseDate = new Date(altDateMatch);
                foundDate = true;
              }
            }
          }
        }
        
        // If still no date found, try another selector specific to Bandcamp
        if (!foundDate || !releaseDate || isNaN(releaseDate.getTime())) {
          // Try meta tag
          const dateElement = albumPage('meta[itemprop="datePublished"]');
          if (dateElement.length) {
            const dateContent = dateElement.attr('content');
            if (dateContent) {
              console.log(`Found date in meta tag: ${dateContent}`);
              releaseDate = new Date(dateContent);
              foundDate = true;
            }
          }
          
          // As a last resort, try to find any text containing "released" followed by a date-like string
          if (!foundDate) {
            // Look through the entire page for any text containing "released" pattern
            const pageText = albumPage('body').text();
            const allReleasedMatches = pageText.match(/released\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi);
            
            if (allReleasedMatches && allReleasedMatches.length > 0) {
              // Use the first match
              const dateText = allReleasedMatches[0].replace(/released\s+/i, '');
              console.log(`Found release date in page text: ${dateText}`);
              releaseDate = new Date(dateText);
              foundDate = true;
            }
          }
        }

        // Check for "Album will be released on..." text patterns indicating future releases
        const preOrderText = albumPage('body').text().match(/will be released on|releases on|available on|releases \w+ \d{1,2},? \d{4}/i);
        const isPreOrder = !!preOrderText;
        if (isPreOrder) {
          console.log(`Found pre-order indication: "${preOrderText[0]}"`);
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
        
        // Check if the release date is in the future
        const now = new Date();
        const isFutureRelease = releaseDate > now;
        
        if (isFutureRelease) {
          console.log(`Skipping future release: ${title} (Release date: ${releaseDate.toISOString()})`);
          continue; // Skip this release and move to the next one
        }
        
        // If we got here, it's not a future release, so add it
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

    // Sort the releases by date, newest first
    releases.sort((a, b) => b.date - a.date);

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
      title: "Bandcamp Releases RSS Feed",
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
    
    let totalReleaseCount = 0;
    
    for (const artist of artists) {
      console.log(`Scraping releases for: ${artist.name}`);
      
      try {
        const releases = await scrapeArtistReleases(artist);
        
        // Filter out sample/example releases
        const realReleases = releases.filter(release => {
          // Skip releases with "Sample" or "Example" in title
          if (
            release.title.includes("Sample") || 
            release.title.includes("Error Reading") || 
            release.title.includes("Example") || 
            release.title.includes("Demo")
          ) {
            console.log(`Filtering out sample release: ${release.title}`);
            return false;
          }
          
          // Skip releases with example URLs
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
        
        const filteredCount = releases.length - realReleases.length;
        totalReleaseCount += realReleases.length;
        
        console.log(`Added ${realReleases.length} releases for ${artist.name} (filtered ${filteredCount} sample/example releases)`);
      } catch (error) {
        console.error(`Error scraping ${artist.name}: ${error.message}`);
      }
    }

    // Only generate feed if we have real content
    if (totalReleaseCount === 0) {
      console.log("No actual releases found for any artists. Not generating empty feed.");
      
      // Create a minimal feed with a message instead
      const rssOutput = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Bandcamp Releases RSS Feed</title>
    <description>Latest releases from your favorite artists</description>
    <link>https://github.com/user/artist-rss-feed-generator</link>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <item>
      <title>No Releases Found</title>
      <link>https://github.com/user/artist-rss-feed-generator</link>
      <description>No releases were found for the configured artists. Please check your artists.json file.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid>https://github.com/user/artist-rss-feed-generator/no-releases-${Date.now()}</guid>
    </item>
  </channel>
</rss>`;
      
      await fs.writeFile(path.join(outputDir, 'artists-feed.xml'), rssOutput);
      console.log(`Minimal RSS feed written to ${path.join(outputDir, 'artists-feed.xml')}`);
    } else {
      // Generate the RSS feed XML
      const rssOutput = feed.rss2();
      
      // Write the feed to the output directory
      await fs.writeFile(path.join(outputDir, 'artists-feed.xml'), rssOutput);
      console.log(`RSS feed with ${totalReleaseCount} releases written to ${path.join(outputDir, 'artists-feed.xml')}`);
    }
    
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
    <title>Bandcamp Releases RSS Feed</title>
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