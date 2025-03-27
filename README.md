# Artist RSS Feed Generator

This repository automatically generates RSS feeds from a list of artist pages, making it easy to follow new releases from your favorite artists.

## How It Works

1. You add artist page URLs to the `artists.json` file
2. GitHub Actions automatically runs on a schedule to fetch the latest releases
3. An RSS feed is generated and published to GitHub Pages
4. Subscribe to the RSS feed in your favorite reader to get updates

## Getting Started

### 1. Fork this repository

Click the "Fork" button at the top right of this repository page.

### 2. Enable GitHub Pages

1. Go to your forked repository's Settings
2. Navigate to "Pages" in the sidebar
3. Under "Source", select "GitHub Actions"
4. Save the changes

### 3. Customize your artist list

Edit the `artists.json` file with your preferred artists:

```json
{
  "artists": [
    {
      "name": "Artist Name",
      "url": "https://example.com/artist/page"
    },
    {
      "name": "Another Artist",
      "url": "https://example.com/another/artist"
    }
  ]
}
```

### 4. Access your RSS feed

Once the GitHub Action has run, your RSS feed will be available at:

```
https://[your-username].github.io/[repository-name]/artists-feed.xml
```

You can then add this URL to your RSS reader of choice.

## Customization

### Changing the update frequency

By default, the feed updates once per day. To change this:

1. Edit the `.github/workflows/generate-feed.yml` file
2. Modify the `schedule` section with a different [cron expression](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule)

### Adding more sources

The scraper currently supports the following artist page formats:
- Bandcamp
- SoundCloud
- Spotify

To add support for additional platforms, you would need to modify the `src/scraper.js` file.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
