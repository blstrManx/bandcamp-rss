import requests
from bs4 import BeautifulSoup
from feedgen.feed import FeedGenerator
import json

CONFIG_FILE = "artists.json"
RSS_FILE = "docs/bandcamp_releases.xml"


def load_artists():
    try:
        with open(CONFIG_FILE, "r") as file:
            return json.load(file)
    except FileNotFoundError:
        return []

def save_artists(artists):
    with open(CONFIG_FILE, "w") as file:
        json.dump(artists, file, indent=4)

def add_artist(artist_url):
    artists = load_artists()
    if artist_url not in artists:
        artists.append(artist_url)
        save_artists(artists)
        print(f"Added new artist: {artist_url}")
    else:
        print("Artist already in list.")

def fetch_bandcamp_releases(artist_url):
    response = requests.get(artist_url)
    soup = BeautifulSoup(response.text, "html.parser")
    
    releases = []
    for item in soup.select(".music-grid .music-grid-item, .track_list .title"):  # Adjusted selectors
        title_element = item.select_one(".heading, .title")  # Alternative title selection
        link_element = item.find("a")
        image_element = item.find("img")
        
        if not title_element or not link_element:
            print(f"Warning: Skipping an item due to missing elements on {artist_url}")
            continue
        
        title = title_element.get_text(strip=True)
        link = link_element["href"] if link_element["href"].startswith("http") else artist_url + link_element["href"]
        image = image_element["src"] if image_element else ""
        releases.append({"title": title, "link": link, "image": image})
    
    return releases

def generate_rss():
    fg = FeedGenerator()
    fg.title("Bandcamp Releases RSS")
    fg.link(href="https://bandcamp.com", rel="self")  # Set a valid link
    fg.description("Latest releases from followed Bandcamp artists")
    
    artists = load_artists()
    for artist_url in artists:
        releases = fetch_bandcamp_releases(artist_url)
        for release in releases:
            fe = fg.add_entry()
            fe.title(release["title"])
            fe.link(href=release["link"])
            fe.description(f'<img src="{release["image"]}"/>')
    
    fg.rss_file(RSS_FILE)
    print(f"RSS feed generated: {RSS_FILE}")

import os

if __name__ == "__main__":
    if os.getenv("GITHUB_ACTIONS"):
        print("Running in GitHub Actions: Generating RSS feed automatically...")
        generate_rss()
    else:
        print("Options: \n1. Add a new artist\n2. Generate RSS feed")
        choice = input("Enter your choice: ")

        if choice == "1":
            artist_url = input("Enter Bandcamp artist URL: ")
            add_artist(artist_url)
        elif choice == "2":
            generate_rss()
        else:
            print("Invalid choice.")
