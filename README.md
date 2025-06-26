# Reddit Flow

A clean minimalist web application that refreshes a reddit list of posts every 
minute.

**[reddit-flow.com](https://reddit-flow.com)**

## Docker Setup

The app is containerized and ready for deployment with optional SSL support using certbot.

### Environment Variables

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

- `SERVER_NAME`: Your domain name or 'localhost' for development
- `EMAIL`: Email address for Let's Encrypt notifications
- `MOCK_CERT`: Set to `1` to create self-signed certificates for development
- `STAGING`: Set to `1` to us Let's Encrypt staging certificates (and avoid rate limiting)

Use the initialization script to set up SSL certificates, and start the server

```bash
./init-letsencrypt.sh
docker compose up -d
```

