# Reddit Flow

A clean minimalist web application for reading Reddit posts from any subreddit with real-time re-ranking

**Website: [reddit-flow.com](https://reddit-flow.com)**

## Features

- **Subreddit Input**: Enter any subreddit name to view its posts
- **Multiple Sort Options**: View posts by Hot, New, Rising, Controversial, or Top
- **Auto-refresh**: Posts refresh every minute
- **Hide Posts**: Hide individual posts (hidden state persists during refresh)
- **Smooth Animations**: Posts slide and animate when rankings change
- **Light/Dark Theme**: Toggle between light and dark themes
- **URL Routing**: Deep-linking support (e.g., `/r/worldnews/new`)

## How to Use

- Open [reddit-flow.com](https://reddit-flow.com) and type-in the subreddit of your choice.
- Alternatively, visit your favorite subreddit URL and replace reddit.com with reddit-flow.com in the url bar.

## Docker Setup

The app is containerized and ready for deployment with optional SSL support using certbot.

### Environment Variables

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

**Environment Variable Reference:**
- `SERVER_NAME`: Your domain name or 'localhost' for development
- `EMAIL`: Email address for Let's Encrypt notifications
- `MOCK_CERT`: Set to `1` to create self-signed certificates for development
- `STAGING`: Set to `1` to us Let's Encrypt staging certificates (and avoid rate limiting)

Use the initialization script to set up SSL certificates, and start the server

```bash
./init-letsencrypt.sh
docker compose up -d
```

