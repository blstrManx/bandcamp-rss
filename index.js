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
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <item>
      <title>No Releases Found</title>
      <description>No releases were found for the configured artists. Please check your artists list.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
  </channel>
</rss>`;
      
      await fs.writeFile(outputFile, rssOutput);
    } else {
      // Generate the RSS feed XML
      console.log(`Generating RSS feed for ${jsonFile} with ${feed.items.length} items`);
      const rssOutput = feed.rss2();
      
      // Debug check - verify the XML output has items
      const hasItems = rssOutput.includes("<item>");
      console.log(`XML output contains items: ${hasItems}`);
      
      // If the feed.rss2() didn't include items, generate manual XML
      if (!hasItems && feed.items.length > 0) {
        console.log("Feed.rss2() failed to include items, using manual XML generation");
        
        // Start with channel info
        let manualRssOutput = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>${feedTitle}</title>
    <description>${feedDescription}</description>
    <link>https://github.com/user/artist-rss-feed-generator</link>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;
        
        // Add each item manually
        for (const item of feed.items) {
          manualRssOutput += `
    <item>
      <title>${item.title}</title>
      <link>${item.link}</link>
      <guid>${item.id || item.link}</guid>
      <pubDate>${item.date.toUTCString()}</pubDate>
      <description>${item.description}</description>`;
          
          // Add author if available
          if (item.author && item.author.length > 0) {
            manualRssOutput += `
      <author>${item.author[0].name}</author>`;
          }
          
          // Add image if available
          if (item.image && item.image.url) {
            manualRssOutput += `
      <enclosure url="${item.image.url}" type="image/jpeg" />`;
          }
          
          manualRssOutput += `
    </item>`;
        }
        
        // Close the channel and rss tags
        manualRssOutput += `
  </channel>
</rss>`;
        
        // Write the manually generated RSS
        await fs.writeFile(outputFile, manualRssOutput);
        console.log(`Manually generated RSS feed written to ${outputFile}`);
      } else {
        // Write the feed to the output directory
        await fs.writeFile(outputFile, rssOutput);
        console.log(`Generated RSS feed written to ${outputFile}`);
      }
    }
    
    console.log(`Feed written to ${outputFile}`);
    
  } catch (error) {
    console.error(`Error generating feed for ${jsonFile}:`, error);
    throw error;
  }
}

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