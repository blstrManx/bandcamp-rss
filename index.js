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
    
    // Create the add-artist handler script
    const addArtistJs = `
// Function to handle the GitHub API
async function addArtistToRepo(artistName, artistUrl, repoOwner, repoName) {
  try {
    // First, get the current artists.json file and its SHA
    const filesResponse = await fetch(\`https://api.github.com/repos/\${repoOwner}/\${repoName}/contents/artists.json\`);
    
    if (!filesResponse.ok) {
      throw new Error(\`Failed to get artists.json: \${filesResponse.status} \${filesResponse.statusText}\`);
    }
    
    const fileData = await filesResponse.json();
    const currentContent = atob(fileData.content);
    const currentArtists = JSON.parse(currentContent);
    
    // Check if artist already exists
    const exists = currentArtists.artists.some(artist => 
      artist.url === artistUrl || artist.name === artistName
    );
    
    if (exists) {
      return { success: false, message: 'This artist already exists in your feed.' };
    }
    
    // Add the new artist
    currentArtists.artists.push({
      name: artistName,
      url: artistUrl
    });
    
    // Sort artists alphabetically by name
    currentArtists.artists.sort((a, b) => a.name.localeCompare(b.name));
    
    // Get user's GitHub token from localStorage (set by the add-artist form)
    const token = localStorage.getItem('github_token');
    if (!token) {
      throw new Error('GitHub token not found. Please provide your token in the form.');
    }
    
    // Update the file in the repository
    const updateResponse = await fetch(\`https://api.github.com/repos/\${repoOwner}/\${repoName}/contents/artists.json\`, {
      method: 'PUT',
      headers: {
        'Authorization': \`token \${token}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: \`Add artist: \${artistName}\`,
        content: btoa(JSON.stringify(currentArtists, null, 2)),
        sha: fileData.sha,
        branch: 'main'
      })
    });
    
    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(\`Failed to update artists.json: \${errorData.message}\`);
    }
    
    return { 
      success: true, 
      message: \`Successfully added \${artistName} to your feed. The feed will update during the next scheduled run.\` 
    };
  } catch (error) {
    console.error('Error adding artist:', error);
    return { success: false, message: \`Error: \${error.message}\` };
  }
}

// Function to trigger the GitHub Action workflow
async function triggerWorkflow(repoOwner, repoName) {
  try {
    const token = localStorage.getItem('github_token');
    if (!token) {
      throw new Error('GitHub token not found');
    }
    
    const response = await fetch(\`https://api.github.com/repos/\${repoOwner}/\${repoName}/dispatches\`, {
      method: 'POST',
      headers: {
        'Authorization': \`token \${token}\`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        event_type: 'manual-trigger'
      })
    });
    
    if (!response.ok) {
      throw new Error(\`Failed to trigger workflow: \${response.status} \${response.statusText}\`);
    }
    
    return { success: true, message: 'Workflow triggered successfully. Your feed will update shortly.' };
  } catch (error) {
    console.error('Error triggering workflow:', error);
    return { success: false, message: \`Error triggering workflow: \${error.message}\` };
  }
}

// Setup event listeners when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Extract repo owner and name from the current URL
  let repoOwner = '';
  let repoName = '';
  
  try {
    const urlPath = window.location.pathname;
    const pathParts = urlPath.split('/').filter(part => part.length > 0);
    
    // In GitHub Pages, the URL format is usually /{username}/{repo-name}/
    if (pathParts.length >= 1) {
      repoName = pathParts[0];
      
      // Try to get the owner from a different method if available
      const metaTag = document.querySelector('meta[name="repository-owner"]');
      if (metaTag) {
        repoOwner = metaTag.content;
      } else {
        // Fallback: prompt the user for their GitHub username
        const usernameForm = document.getElementById('username-form');
        usernameForm.style.display = 'block';
        
        document.getElementById('username-submit').addEventListener('click', function() {
          repoOwner = document.getElementById('github-username').value.trim();
          if (repoOwner) {
            document.getElementById('repo-owner').textContent = repoOwner;
            document.getElementById('repo-name').textContent = repoName;
            usernameForm.style.display = 'none';
            document.getElementById('add-artist-section').style.display = 'block';
          } else {
            alert('Please enter your GitHub username');
          }
        });
      }
    }
  } catch (error) {
    console.error('Error parsing repository info:', error);
  }
  
  // Setup the add artist form
  const addArtistForm = document.getElementById('add-artist-form');
  if (addArtistForm) {
    addArtistForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const artistName = document.getElementById('artist-name').value.trim();
      const artistUrl = document.getElementById('artist-url').value.trim();
      const token = document.getElementById('github-token').value.trim();
      
      if (!artistName || !artistUrl) {
        alert('Please enter both artist name and URL');
        return;
      }
      
      if (!token) {
        alert('Please enter your GitHub personal access token');
        return;
      }
      
      // Save token to localStorage for future use
      localStorage.setItem('github_token', token);
      
      // Show loading state
      const submitButton = document.getElementById('add-artist-submit');
      const originalButtonText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Adding...';
      
      // Update status message
      const statusMsg = document.getElementById('status-message');
      statusMsg.textContent = 'Adding artist to repository...';
      statusMsg.className = 'status-message info';
      
      try {
        // Add the artist to the repository
        const result = await addArtistToRepo(artistName, artistUrl, repoOwner, repoName);
        
        if (result.success) {
          statusMsg.textContent = result.message;
          statusMsg.className = 'status-message success';
          
          // Clear form inputs
          document.getElementById('artist-name').value = '';
          document.getElementById('artist-url').value = '';
          
          // Ask if they want to trigger an immediate update
          if (confirm('Artist added successfully! Would you like to trigger an immediate feed update?')) {
            statusMsg.textContent = 'Triggering feed update...';
            statusMsg.className = 'status-message info';
            
            const workflowResult = await triggerWorkflow(repoOwner, repoName);
            if (workflowResult.success) {
              statusMsg.textContent = workflowResult.message;
              statusMsg.className = 'status-message success';
            } else {
              statusMsg.textContent = workflowResult.message;
              statusMsg.className = 'status-message error';
            }
          }
          
          // Refresh the artist list
          setTimeout(() => {
            fetchArtistList();
          }, 1000);
        } else {
          statusMsg.textContent = result.message;
          statusMsg.className = 'status-message error';
        }
      } catch (error) {
        console.error('Error in add artist process:', error);
        statusMsg.textContent = \`Error: \${error.message}\`;
        statusMsg.className = 'status-message error';
      } finally {
        // Reset button state
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    });
  }
  
  // Initialize repository information if available
  if (repoOwner && repoName) {
    document.getElementById('repo-owner').textContent = repoOwner;
    document.getElementById('repo-name').textContent = repoName;
    document.getElementById('add-artist-section').style.display = 'block';
  } else if (repoName) {
    document.getElementById('repo-name-display').textContent = repoName;
    document.getElementById('username-form').style.display = 'block';
  }
});

// Function to fetch and display the artist list
function fetchArtistList() {
  const artistListElement = document.getElementById('artistList');
  artistListElement.textContent = 'Loading artist list...';
  
  fetch('./artists.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
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
      artistListElement.textContent = 'Error loading artist list. The list may still be generating.';
      
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
}

// Call the fetchArtistList function once the page loads
document.addEventListener('DOMContentLoaded', fetchArtistList);
`;
    
    await fs.writeFile(path.join(outputDir, 'add-artist.js'), addArtistJs);
    console.log(`Add artist JavaScript written to ${path.join(outputDir, 'add-artist.js')}`);
    
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
      --error-color: #cf6679;
      --success-color: #03dac6;
      --info-color: #bb86fc;
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
    ul.artist-list {
      padding-left: 20px;
    }
    ul.artist-list li {
      margin-bottom: 8px;
    }
    .artist-link {
      color: var(--link-color);
      text-decoration: none;
    }
    .artist-link:hover {
      text-decoration: underline;
    }
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border-color);
      font-size: 0.9em;
    }
    footer a {
      color: var(--link-color);
    }
    
    /* Form styles */
    .form-section {
      background-color: var(--secondary-bg);
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
      border: 1px solid var(--border-color);
    }
    .form-row {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    input[type="text"],
    input[type="password"],
    input[type="url"] {
      width: 100%;
      padding: 10px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      background-color: #2a2a2a;
      color: var(--text-color);
      font-size: 16px;
    }
    button {
      background-color: var(--accent-color);
      color: #000000;
      border: none;
      padding: 10px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
    }
    button:hover {
      opacity: 0.9;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .status-message {
      padding: 10px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .success {
      background-color: rgba(3, 218, 198, 0.2);
      border: 1px solid var(--success-color);
    }
    .error {
      background-color: rgba(207, 102, 121, 0.2);
      border: 1px solid var(--error-color);
    }
    .info {
      background-color: rgba(187, 134, 252, 0.2);
      border: 1px solid var(--info-color);
    }
    .token-info {
      font-size: 0.9em;
      margin-top: 5px;
      opacity: 0.8;
    }
    .hidden {
      display: none;
    }
    .tabs {
      display: flex;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
    }
    .tab {
      padding: 10px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-right: 10px;
    }
    .tab.active {
      border-bottom: 2px solid var(--accent-color);
      color: var(--accent-color);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Artist RSS Feed Generator</h1>
    
    <!-- Tabs -->
    <div class="tabs">
      <div class="tab active" data-tab="feed">Feed Info</div>
      <div class="tab" data-tab="add">Add Artist</div>
    </div>
    
    <!-- Feed Info Tab -->
    <div id="feed-tab" class="tab-content active">
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
    </div>
    
    <!-- Add Artist Tab -->
    <div id="add-tab" class="tab-content">
      <h2>Add Artist to Feed</h2>
      <p>Use this form to add a new artist to your RSS feed.</p>
      
      <!-- Username form (only shown if needed) -->
      <div id="username-form" class="form-section" style="display: none;">
        <h3>Confirm Your GitHub Username</h3>
        <p>We detected your repository name as: <strong id="repo-name-display"></strong></p>
        <p>Please enter your GitHub username to continue:</p>
        
        <div class="form-row">
          <input type="text" id="github-username" placeholder="Your GitHub username">
        </div>
        
        <button id="username-submit">Confirm Username</button>
      </div>
      
      <!-- Add Artist Form -->
      <div id="add-artist-section" class="form-section" style="display: none;">
        <h3>Add New Artist</h3>
        <p>Adding to repository: <strong id="repo-owner"></strong>/<strong id="repo-name"></strong></p>
        
        <form id="add-artist-form">
          <div class="form-row">
            <label for="artist-name">Artist Name</label>
            <input type="text" id="artist-name" required placeholder="e.g. Radiohead">
          </div>
          
          <div class="form-row">
            <label for="artist-url">Artist URL</label>
            <input type="url" id="artist-url" required placeholder="e.g. https://bandcamp.com/artist">
          </div>
          
          <div class="form-row">
            <label for="github-token">GitHub Personal Access Token</label>
            <input type="password" id="github-token" required placeholder="ghp_xxxxxxxxxxxx">
            <div class="token-info">
              Needs permissions: repo, workflow<br>
              <a href="https://github.com/settings/tokens" target="_blank" style="color: var(--link-color);">
                Generate a token here
              </a>
            </div>
          </div>
          
          <button type="submit" id="add-artist-submit">Add Artist</button>
        </form>
        
        <div id="status-message" class="status-message" style="display: none;"></div>
      </div>
      
      <div class="form-section">
        <h3>Manual Update Instructions</h3>
        <p>If you prefer to manually update your feed:</p>
        <ol>
          <li>Edit the <code>artists.json</code> file in your repository</li>
          <li>Add new artist entries in the format shown below</li>
          <li>Commit the changes to the main branch</li>
          <li>The feed will update automatically during the next scheduled run</li>
        </ol>
        
        <pre>{
  "artists": [
    {
      "name": "Artist Name", 
      "url": "https://example.com/artist"
    }
  ]
}</pre>
      </div>
    </div>
    
    <footer>
      <p>Generated by <a href="https://github.com/blstrManx/bandcamp-rss">Artist RSS Feed Generator</a></p>
    </footer>
  </div>
  
  <script src="./add-artist.js"></script>
  <script>
    // Tab functionality
    document.addEventListener('DOMContentLoaded', function() {
      const tabs = document.querySelectorAll('.tab');
      const tabContents = document.querySelectorAll('.tab-content');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', function() {
          const tabId = this.getAttribute('data-tab');
          
          // Remove active class from all tabs and contents
          tabs.forEach(t => t.classList.remove('active'));
          tabContents.forEach(c => c.classList.remove('active'));
          
          // Add active class to selected tab and content
          this.classList.add('active');
          document.getElementById(tabId + '-tab').classList.add('active');
        });
      });
      
      // Display status message if it has content
      const statusMsg = document.getElementById('status-message');
      if (statusMsg && statusMsg.textContent.trim() !== '') {
        statusMsg.style.display = 'block';
      }
    });
  </script>
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