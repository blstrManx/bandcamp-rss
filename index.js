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
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Bandcamp-specific selectors for releases
    $('.music-grid-item').each((i, el) => {
      const releaseUrl = $(el).find('a').attr('href');
      const title = $(el).find('.title').text().trim();
      const imageUrl = $(el).find('img').attr('src') || '';
      const dateText = $(el).find('.released').text().trim();
      
      // Parse date or use current date if not found
      let date;
      try {
        if (dateText) {
          date = new Date(dateText.replace('released ', ''));
        } else {
          date = new Date();
        }
      } catch (e) {
        date = new Date();
      }

      releases.push({
        title,
        url: releaseUrl.startsWith('http') ? releaseUrl : url + releaseUrl,
        date,
        image: imageUrl,
        description: `New release by ${$(el).find('.artist-override').text().trim() || 'artist'}`
      });
    });

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
    
    <h3>Currently Tracking</h3>
    <p>This feed is currently tracking releases from the following artists:</p>
    <pre id="artistList">Loading artist list...</pre>
    
    <script>
      // Fetch the artists directly from the JSON file
      fetch('./artists.json')
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          return response.json();
        })
        .then(data => {
          const artistListElement = document.getElementById('artistList');
          
          if (data && Array.isArray(data) && data.length > 0) {
            const artistListHtml = document.createElement('ul');
            artistListHtml.className = 'artist-list';
            
            data.forEach(artist => {
              const listItem = document.createElement('li');
              const artistLink = document.createElement('a');
              artistLink.href = artist.url;
              artistLink.className = 'artist-link';
              artistLink.textContent = artist.name;
              artistLink.target = '_blank';
              
              listItem.appendChild(artistLink);
              artistListHtml.appendChild(listItem);
            });
            
            // Clear loading message and add the list
            artistListElement.innerHTML = '';
            artistListElement.appendChild(artistListHtml);
          } else {
            artistListElement.textContent = 'No artists found in the feed.';
          }
        })
        .catch(error => {
          console.error('Error fetching artist data:', error);
          document.getElementById('artistList').textContent = 'Error loading artist list. The list may still be generating.';
          
          // Try the alternative method using the XML as fallback
          fetch('./artists-feed.xml')
            .then(response => response.text())
            .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
            .then(data => {
              try {
                const items = data.querySelectorAll('item');
                const artistMap = new Map();
                
                items.forEach(item => {
                  const authorElement = item.querySelector('author');
                  if (authorElement) {
                    const authorText = authorElement.textContent.trim();
                    const authorMatch = authorText.match(/([^<]+)(?:<([^>]+)>)?/);
                    if (authorMatch && authorMatch[1]) {
                      const name = authorMatch[1].trim();
                      const link = authorMatch[2] ? authorMatch[2].trim() : '';
                      artistMap.set(name, link);
                    }
                  }
                });
                
                if (artistMap.size > 0) {
                  const artistListElement = document.getElementById('artistList');
                  const artistListHtml = document.createElement('ul');
                  artistListHtml.className = 'artist-list';
                  
                  for (const [name, link] of artistMap.entries()) {
                    const listItem = document.createElement('li');
                    if (link) {
                      const artistLink = document.createElement('a');
                      artistLink.href = link;
                      artistLink.className = 'artist-link';
                      artistLink.textContent = name;
                      artistLink.target = '_blank';
                      listItem.appendChild(artistLink);
                    } else {
                      listItem.textContent = name;
                    }
                    artistListHtml.appendChild(listItem);
                  }
                  
                  // Clear loading message and add the list
                  artistListElement.innerHTML = '';
                  artistListElement.appendChild(artistListHtml);
                }
              } catch (xmlError) {
                console.error('Error parsing XML:', xmlError);
              }
            })
            .catch(xmlError => {
              console.error('Error with fallback XML method:', xmlError);
            });
        });
    </script>
    
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