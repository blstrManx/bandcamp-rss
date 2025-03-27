import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Feed } from 'feed';
import axios from 'axios';
import * as cheerio from 'cheerio'; 

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the output directory
const outputDir = path.join(__dirname, 'dist');

// Ensure the output directory exists
fs.ensureDirSync(outputDir);

async function generateFeed() {
  try {
    console.log('Generating RSS feed...');
    
    // Read the artists.json file
    const artistsFile = path.join(__dirname, 'artists.json');
    console.log(`Reading artists from: ${artistsFile}`);
    
    let artistsData;
    try {
      artistsData = await fs.readJson(artistsFile);
      console.log('Successfully read artists.json');
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
      console.log('Using default artist data instead');
    }
    
    const artists = artistsData.artists || [];

    if (artists.length === 0) {
      console.log('No artists found in artists.json, using a demo artist');
      artists.push({
        name: "Demo Artist",
        url: "https://example.com/demo"
      });
    }

    console.log(`Found ${artists.length} artists to process`);

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
    for (const artist of artists) {
      console.log(`Adding sample release for: ${artist.name}`);
      
      // Add a sample release for each artist
      feed.addItem({
        title: `${artist.name} - Demo Release`,
        id: artist.url,
        link: artist.url,
        description: `Demo release by ${artist.name}`,
        author: [
          {
            name: artist.name,
            link: artist.url
          }
        ],
        date: new Date()
      });
    }

    // Generate the RSS feed XML
    const rssOutput = feed.rss2();
    
    // Write the feed to the output directory
    await fs.writeFile(path.join(outputDir, 'artists-feed.xml'), rssOutput);
    console.log(`RSS feed written to ${path.join(outputDir, 'artists-feed.xml')}`);
    
    // Also write a JSON file with just the artist info for easier parsing
    await fs.writeFile(
      path.join(outputDir, 'artists.json'), 
      JSON.stringify(artists, null, 2)
    );
    console.log(`Artists JSON written to ${path.join(outputDir, 'artists.json')}`);
    
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
    pre {
      background-color: #f6f8fa;
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
    }
    ul.artist-list {
      padding-left: 20px;
    }
    ul.artist-list li {
      margin-bottom: 8px;
    }
    .artist-link {
      color: #0366d6;
      text-decoration: none;
    }
    .artist-link:hover {
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
    
    <h3>Currently Tracking</h3>
    <p>This feed is currently tracking releases from the following artists:</p>
    <div id="artistList">Loading artist list...</div>
    
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
    <p><p>This feed was last updated on: ${
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
		}</p></p>
    
    <footer>
      <p>Generated by <a href="https://github.com/blstrManx/bandcamp-rss">Bandcamp RSS Feed Generator</a></p>
    </footer>
  </div>
</body>
</html>`;
    
    await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);
    console.log(`Index page written to ${path.join(outputDir, 'index.html')}`);
    
    // Create a .nojekyll file to disable GitHub Pages Jekyll processing
    await fs.writeFile(path.join(outputDir, '.nojekyll'), '');
    console.log('.nojekyll file created to disable Jekyll processing');

    console.log('All files generated successfully!');
  } catch (error) {
    console.error('Error generating feed:', error);
    process.exit(1);
  }
}

// Generate the feed
generateFeed();