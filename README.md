# Bandcamp RSS Feed Generator

This repository automatically generates RSS feeds from a list of artist pages, making it easy to follow new releases from your favorite artists.

## How It Works

1. You add artist page URLs to the `artists.json` file
2. GitHub Actions automatically runs on a schedule to fetch the latest releases
3. An RSS feed is generated and published to GitHub Pages
4. Subscribe to the RSS feed in your favorite reader to get updates

## Quick Start

### 1. Fork this repository

Click the "Fork" button at the top right of this repository page.

### 2. Update Workflow Permissions

1. Go to your forked repository's Settings
2. Click on "Actions" in the left sidebar under "Code and automation" 
3. In the "Workflow permissions" section, select "Read and write permissions"
4. Save the changes

This allows GitHub Actions to create and push to the gh-pages branch.

### 3. Customize your artist list

Add a json file to the artists folder with this formatting:

```json
{
	"title": "My cool EDM feed",
	"description": "all of my favorite EDM labels",
	"artists": [
	{
	  "name": "HARDCORE TANO*C",
	  "url": "https://tanoc.bandcamp.com/music",
	  "maxReleases": 3
	},
	{
	  "name": "Warp Records",
	  "url": "https://warprecords.bandcamp.com/music"
	}
	]
}
```

Use as many json files as you want seperate feeds. Include maxReleases if you want to specify an amount to check. The default is 2, feel free to change it.

### 4. Run the GitHub Action

1. Go to the "Actions" tab in your repository
2. Find the "Generate RSS Feed" workflow
3. Click "Run workflow"
4. Wait for the workflow to complete (this creates the gh-pages branch)

Note: the workflow runs once per day at midnight GMT automatically.

### 5. Enable GitHub Pages

1. Go to your repository's Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Source", select "Deploy from a branch"
4. For the branch, select "gh-pages" and "/ (root)"
5. Save the changes

### 6. Access your RSS feeds

Once GitHub Pages is enabled, your feeds will be available at:

```
https://[your-username].github.io/[repository-name]/
```

Navigate through your feeds and copy your xml file from here.

## Current Features

- Automatic feed generation on a daily schedule
- Organize your artists into multiple feeds
- RSS feeds compatible with all major feed readers

## Technical Details

### Project Structure

- `index.js` - Main script that generates the RSS feed and HTML page
- `artists/*.json` - Input files containing your artist links, can be named however you like
- `.github/workflows/generate-feed.yml` - GitHub Actions workflow for automation
- `dist/` - Output directory for generated files (created during build)

### Dependencies

- `feed` - RSS feed generation
- `axios` - HTTP requests
- `cheerio` - HTML parsing
- `fs-extra` - Enhanced file system operations

### Customization

#### Changing the update frequency

By default, the feed updates once per day. To change this:

1. Edit the `.github/workflows/generate-feed.yml` file
2. Modify the `schedule` section with a different [cron expression](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule)

## Troubleshooting

### RSS Feed Not Showing

If your RSS feed is not accessible after deployment:

1. Check that GitHub Pages is properly configured to use the gh-pages branch
2. Verify that the workflow ran successfully (check Actions tab)
3. Make sure your repository has proper permissions for GitHub Actions

### Fixing GitHub Pages Issues

If you see a 404 error when trying to access your site:

1. Ensure the gh-pages branch exists in your repository
2. Check that GitHub Pages settings point to that branch
3. Try adding a `.nojekyll` file to your gh-pages branch (this is done automatically by the workflow)

## Soundcloud and Spotify

Spotify seems like it would be quite complicated to get working. It's unlikely. Soundcloud support is almost there, but there is no ETA.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

This project is made mainly for personal use and is unlikely to be updated past any features I see fit. Feel free to submit a pull request though, if I see something cool, who knows.