import axios from 'axios';
import cheerio from 'cheerio';

/**
 * Scrape releases from an artist page
 * @param {Object} artist - Artist object with name and url
 * @returns {Promise<Array>} - Array of release objects
 */
export async function scrapeArtistReleases(artist) {
  const { url } = artist;
  
  // Determine which scraper to use based on the URL
  if (url.includes('bandcamp.com')) {
    return scrapeBandcamp(url);
  } else if (url.includes('soundcloud.com')) {
    return scrapeSoundcloud(url);
  } else if (url.includes('spotify.com')) {
    return scrapeSpotify(url);
  } else {
    // Default generic scraper
    return scrapeGeneric(url);
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

    return releases;
  } catch (error) {
    console.error(`Error scraping Bandcamp: ${error.message}`);
    return [];
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

    return releases;
  } catch (error) {
    console.error(`Error scraping SoundCloud: ${error.message}`);
    return [];
  }
}

/**
 * Scrape releases from a Spotify artist page
 * @param {string} url - Spotify artist URL
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeSpotify(url) {
  try {
    // Note: Spotify requires authentication for API access
    // This is a simplified version that attempts to scrape the public page
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Spotify-specific selectors (note: may not work due to Spotify's dynamic loading)
    $('section[data-testid="album-section"] div[data-testid="grid-container"] div[role="row"]').each((i, el) => {
      const title = $(el).find('a[data-testid="internal-track-link"]').text().trim();
      const releaseUrl = $(el).find('a[data-testid="internal-track-link"]').attr('href');
      
      if (title && releaseUrl) {
        releases.push({
          title,
          url: releaseUrl.startsWith('http') ? releaseUrl : `https://open.spotify.com${releaseUrl}`,
          date: new Date(), // Spotify doesn't easily show release dates on the main page
          image: '', // Would need additional requests to get images
          description: `New release on Spotify`
        });
      }
    });

    return releases;
  } catch (error) {
    console.error(`Error scraping Spotify: ${error.message}`);
    return [];
  }
}

/**
 * Generic scraper for unknown artist page formats
 * @param {string} url - Artist URL
 * @returns {Promise<Array>} - Array of release objects
 */
async function scrapeGeneric(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const releases = [];

    // Look for common patterns that might indicate releases
    // This is a best-effort approach and may not work for all sites
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      
      // Look for links that might be releases (containing words like "album", "single", "release")
      const releaseKeywords = ['album', 'single', 'ep', 'release', 'track', 'song'];
      
      if (href && text && releaseKeywords.some(keyword => 
        href.toLowerCase().includes(keyword) || text.toLowerCase().includes(keyword))
      ) {
        releases.push({
          title: text,
          url: href.startsWith('http') ? href : new URL(href, url).toString(),
          date: new Date(),
          image: '',
          description: `Possible new release: ${text}`
        });
      }
    });

    return releases.slice(0, 10); // Limit to 10 to avoid too many false positives
  } catch (error) {
    console.error(`Error with generic scraper: ${error.message}`);
    return [];
  }
}
