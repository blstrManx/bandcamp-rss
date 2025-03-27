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

/**
 * Scrape releases from an artist page
 * @param {Object} artist - Artist object with name and url
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeArtistReleases(artist) {
  const { url } = artist;
  console.log(`Scraping releases for ${artist.name} from ${url}`);
  
  try {
    // Determine which scraper to use based on the URL
    if (url.includes('bandcamp.com')) {
      return await scrapeBandcamp(url, artist.name);
    } else if (url.includes('soundcloud.com')) {
      return await scrapeSoundcloud(url, artist.name);
    } else if (url.includes('spotify.com')) {
      return await scrapeSpotify(url, artist.name);
    } else {
      // Default generic scraper
      return await scrapeGeneric(url, artist.name);
    }
  } catch (error) {
    console.error(`Error scraping ${artist.name}: ${error.message}`);
    return [{
      title: "Error Fetching Releases",
      url: artist.url,
      description: `Could not retrieve releases for ${artist.name}`,
      date: new Date()
    }];
  }
}

/**
 * Scrape releases from a Bandcamp artist page
 * @param {string} url - Bandcamp artist URL
 * @param {string} artistName - Name of the artist
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeBandcamp(url, artistName) {
  try {
    console.log(`Using Bandcamp scraper for ${artistName}`);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Bandcamp-specific selectors for releases
    $('.music-grid-item').each((i, el) => {
      try {
        const titleElement = $(el).find('.title');
        const title = titleElement.text().trim();
        const releaseUrl = $(el).find('a').attr('href');
        const imageUrl = $(el).find('img').attr('src') || '';
        let dateText = $(el).find('.release-date').text().trim();
        if (!dateText) {
          dateText = $(el).find('.datetime').text().trim();
        }
        
        // Parse date or use current date if not found
        let date;
        try {
          if (dateText) {
            date = new Date(dateText.replace('released ', ''));
            if (isNaN(date.getTime())) {
              date = new Date(); // Fallback to current date if parsing fails
            }
          } else {
            date = new Date();
          }
        } catch (e) {
          date = new Date();
        }

        if (title && releaseUrl) {
          releases.push({
            title,
            url: releaseUrl.startsWith('http') ? releaseUrl : (url.endsWith('/') ? url.slice(0, -1) : url) + releaseUrl,
            date,
            image: imageUrl,
            description: `Release by ${artistName}: ${title}`
          });
        }
      } catch (err) {
        console.error(`Error processing a Bandcamp release: ${err.message}`);
      }
    });

    console.log(`Found ${releases.length} releases on Bandcamp for ${artistName}`);
    
    if (releases.length === 0) {
      // Try alternate selector pattern for Bandcamp
      console.log(`Trying alternate Bandcamp selector for ${artistName}`);
      $('.collection-item-container').each((i, el) => {
        try {
          const title = $(el).find('.collection-item-title').text().trim();
          const releaseUrl = $(el).find('a').attr('href');
          const imageUrl = $(el).find('img').attr('src') || '';
          
          if (title && releaseUrl) {
            releases.push({
              title,
              url: releaseUrl.startsWith('http') ? releaseUrl : (url.endsWith('/') ? url.slice(0, -1) : url) + releaseUrl,
              date: new Date(),
              image: imageUrl,
              description: `Release by ${artistName}: ${title}`
            });
          }
        } catch (err) {
          console.error(`Error processing alternate Bandcamp selector: ${err.message}`);
        }
      });
      
      console.log(`Found ${releases.length} releases with alternate Bandcamp selector for ${artistName}`);
    }

    return releases.length > 0 ? releases : [{
      title: "No Releases Found",
      url: url,
      date: new Date(),
      description: `Could not find any releases for ${artistName} on Bandcamp. Check back later!`
    }];
  } catch (error) {
    console.error(`Error scraping Bandcamp for ${artistName}: ${error.message}`);
    return [{
      title: "Error Reading Bandcamp",
      url: url,
      date: new Date(),
      description: `Error fetching Bandcamp releases for ${artistName}: ${error.message}`
    }];
  }
}

/**
 * Scrape releases from a SoundCloud artist page
 * @param {string} url - SoundCloud artist URL
 * @param {string} artistName - Name of the artist
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeSoundcloud(url, artistName) {
  try {
    console.log(`Using SoundCloud scraper for ${artistName}`);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // SoundCloud-specific selectors for tracks
    $('.soundList__item').each((i, el) => {
      try {
        const title = $(el).find('.soundTitle__title').text().trim();
        const releaseUrl = $(el).find('.soundTitle__title').attr('href');
        const imageUrl = $(el).find('.image__full').attr('src') || '';
        const dateText = $(el).find('.soundTitle__uploadTime').text().trim();
        
        // Parse date or use current date if not found
        let date;
        try {
          if (dateText) {
            date = new Date(dateText);
            if (isNaN(date.getTime())) {
              date = new Date(); // Fallback to current date if parsing fails
            }
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
            description: `Track by ${artistName}: ${title}`
          });
        }
      } catch (err) {
        console.error(`Error processing a SoundCloud track: ${err.message}`);
      }
    });

    console.log(`Found ${releases.length} tracks on SoundCloud for ${artistName}`);
    
    // Try alternate selector if no tracks found
    if (releases.length === 0) {
      console.log(`Trying alternate SoundCloud selector for ${artistName}`);
      $('.trackList__item').each((i, el) => {
        try {
          const titleElement = $(el).find('.trackItem__trackTitle');
          const title = titleElement.text().trim();
          const releaseUrl = titleElement.attr('href') || $(el).find('a').attr('href');
          
          if (title && releaseUrl) {
            releases.push({
              title,
              url: releaseUrl.startsWith('http') ? releaseUrl : `https://soundcloud.com${releaseUrl}`,
              date: new Date(),
              description: `Track by ${artistName}: ${title}`
            });
          }
        } catch (err) {
          console.error(`Error processing alternate SoundCloud selector: ${err.message}`);
        }
      });
      
      console.log(`Found ${releases.length} tracks with alternate SoundCloud selector for ${artistName}`);
    }

    return releases.length > 0 ? releases : [{
      title: "No Tracks Found",
      url: url,
      date: new Date(),
      description: `Could not find any tracks for ${artistName} on SoundCloud. Check back later!`
    }];
  } catch (error) {
    console.error(`Error scraping SoundCloud for ${artistName}: ${error.message}`);
    return [{
      title: "Error Reading SoundCloud",
      url: url,
      date: new Date(),
      description: `Error fetching SoundCloud tracks for ${artistName}: ${error.message}`
    }];
  }
}

/**
 * Scrape releases from a Spotify artist page
 * @param {string} url - Spotify artist URL
 * @param {string} artistName - Name of the artist
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeSpotify(url, artistName) {
  try {
    console.log(`Using Spotify scraper for ${artistName}`);
    // Note: Spotify is challenging to scrape directly due to its dynamic content loading
    // This is a best-effort attempt
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Try to find any links that might be releases
    $('a').each((i, el) => {
      try {
        const href = $(el).attr('href') || '';
        if (href.includes('/album/') || href.includes('/track/')) {
          const title = $(el).text().trim();
          if (title && title.length > 1 && !title.includes('http')) {
            const fullUrl = href.startsWith('http') ? href : `https://open.spotify.com${href}`;
            // Check if this URL is already in the releases
            const isDuplicate = releases.some(release => release.url === fullUrl);
            
            if (!isDuplicate) {
              releases.push({
                title,
                url: fullUrl,
                date: new Date(),
                description: `Release by ${artistName}: ${title}`
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error processing a Spotify element: ${err.message}`);
      }
    });

    console.log(`Found ${releases.length} potential releases on Spotify for ${artistName}`);
    
    // Limit to 5 most likely results to avoid noise
    const filteredReleases = releases
      .filter(release => !release.title.toLowerCase().includes('spotify') && 
                         !release.title.toLowerCase().includes('cookie') &&
                         !release.title.toLowerCase().includes('sign in'))
      .slice(0, 5);

    return filteredReleases.length > 0 ? filteredReleases : [{
      title: "Spotify Releases",
      url: url,
      date: new Date(),
      description: `Visit Spotify to see releases from ${artistName}`
    }];
  } catch (error) {
    console.error(`Error scraping Spotify for ${artistName}: ${error.message}`);
    return [{
      title: "Spotify Releases Available",
      url: url,
      date: new Date(),
      description: `Visit this link to see ${artistName}'s releases on Spotify`
    }];
  }
}

/**
 * Generic scraper for unknown artist page formats
 * @param {string} url - Artist URL
 * @param {string} artistName - Name of the artist
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeGeneric(url, artistName) {
  try {
    console.log(`Using generic scraper for ${artistName}`);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Look for common patterns that might indicate releases
    const releaseKeywords = ['album', 'single', 'ep', 'release', 'track', 'song', 'music'];
    
    // Scan all links for potential releases
    $('a').each((i, el) => {
      try {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        
        if (text && href && text.length > 3 && text.length < 100) {
          // Check if the link or text contains release-related keywords
          const containsKeyword = releaseKeywords.some(keyword => 
            href.toLowerCase().includes(keyword) || text.toLowerCase().includes(keyword)
          );
          
          if (containsKeyword) {
            // Make absolute URL
            let absoluteUrl;
            try {
              absoluteUrl = href.startsWith('http') ? href : new URL(href, url).toString();
            } catch (e) {
              absoluteUrl = url;
            }
            
            // Check if this URL is already in the releases
            const isDuplicate = releases.some(release => release.url === absoluteUrl || release.title === text);
            
            if (!isDuplicate) {
              releases.push({
                title: text,
                url: absoluteUrl,
                date: new Date(),
                description: `Possible release by ${artistName}: ${text}`
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error processing a generic element: ${err.message}`);
      }
    });

    console.log(`Found ${releases.length} potential releases with generic scraper for ${artistName}`);
    
    // Limit to 3 most likely results to avoid noise
    return releases.slice(0, 3);
  } catch (error) {
    console.error(`Error with generic scraper for ${artistName}: ${error.message}`);
    return [{
      title: "Visit Artist Page",
      url: url,
      date: new Date(),
      description: `Visit this link to see ${artistName}'s releases`
    }];
  }
}

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
      console.log(`Processing artist: ${artist.name}`);
      
      try {
        // Use the scraper to get actual releases
        const releases = await scrapeArtistReleases(artist);
        
        console.log(`Found ${releases.length} releases for ${artist.name}`);
        
        // Add each release to the feed
        for (const release of releases) {
          feed.addItem({
            title: `${artist.name} - ${release.title}`,
            id: release.url,
            link: release.url,
            description: release.description || `Release by ${artist.name}`,
            author: [
              {
                name: artist.name,
                link: artist.url
              }
            ],
            date: release.date || new Date(),
            image: release.image
          });
        }
      } catch (error) {
        console.error(`Error processing ${artist.name}: ${error.message}`);
        // Add a fallback entry
        feed.addItem({
          title: `${artist.name} - Error fetching releases`,
          id: `${artist.url}#error-${Date.now()}`,
          link: artist.url,
          description: `Could not retrieve releases for ${artist.name}. Please visit their page directly.`,
          author: [
            {
              name: artist.name,
              link: artist.url
            }
          ],
          date: new Date()
        });
      }
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
    
    // Generate the add-artist.js and index.html files (code omitted for brevity)
    // ... (existing code for generating additional files)
    
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