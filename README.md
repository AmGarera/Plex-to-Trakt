# Plex to Trakt

Automatically sync your Plex watch history to Trakt.tv using webhooks.

> **⚠️ Disclaimer:** This project was generated 100% by AI. I just needed multi-user support and the ability for users to add their own Trakt credentials for this type of sync and I couldn't find any project that fit my needs.

## Features

- 🎬 Real-time sync from Plex to Trakt via webhooks
- 📺 Supports both movies, TV shows and Anime
- ⏱️ **Watch progress sync** - Sync playback position in real-time, not just completion
- 📊 **Sync history tracking** - View all sync activity with detailed logs
- 🔄 Automatic token refresh (access tokens every 24h, refresh tokens kept alive)
- 🐳 Docker support for easy deployment
- 🔐 Secure user authentication with Plex and Trakt
- 👥 Multi-user support - only users with access to your Plex server can login and add their Trakt credentials
- ⚙️ Configurable sync settings per user (throttling, progress thresholds)

![App](/photos/app.png)

## Prerequisites

- Plex Media Server with Plex Pass (required for webhooks)
- Trakt.tv account
- Trakt API application credentials ([Create one here](https://trakt.tv/oauth/applications))

## Quick Start with Docker

1. Clone the repository:

```bash
clone the repo
cd Plex-to-Trakt
```

2. Create a `.env` file from the example:

```bash
cp .env.example .env
```

3. Edit `.env` and fill in your configuration:

   - `EXTERNAL_URL`: Your domain if behind reverse proxy (e.g., `https://plex-trakt.yourdomain.com`) or `http://localhost:3000` for local
   - `PLEX_CLIENT_ID`: Generate a unique identifier (e.g., UUID)
   - `PLEX_SERVER_ID`: Your Plex server machine identifier (for server access verification)
   - `PLEX_SERVER_IP`: Your Plex server IP address (for webhook security)
   - `SESSION_SECRET`: A random secret string for session encryption

4. Build and start with Docker:

```bash
docker-compose up -d
```

The Docker container will automatically initialize the database on first run.

5. Open http://localhost:3000 (or your configured external URL) in your browser

6. Authenticate with Plex and configure your Trakt credentials

7. Set up the Plex webhook:
   - In Plex Settings → Webhooks
   - Add webhook URL: `http://your-server:3000/webhooks/plex` (or your external URL)

## Manual Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables in `.env` file

3. Initialize the database:

```bash
npm run prisma:migrate
```

**Important**: This must be run before starting the server for the first time.

```bash
npm run prisma:generate
```

4. Start the application:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Configuration

### Environment Variables

| Variable         | Description                                                                              | Required |
| ---------------- | ---------------------------------------------------------------------------------------- | -------- |
| `EXTERNAL_URL`   | External URL for the application (e.g., https://yourdomain.com or http://localhost:3000) | Yes      |
| `PLEX_CLIENT_ID` | Unique client identifier for Plex OAuth                                                  | Yes      |
| `PLEX_SERVER_ID` | Your Plex server Machine Identifier (see below for how to find it)                       | Yes      |
| `PLEX_SERVER_IP` | IP address of your Plex server for webhook security                                      | No       |
| `SESSION_SECRET` | Secret key for session encryption                                                        | Yes      |

### Finding Your Plex Server ID

To find your Plex server machine identifier:

1. Open `http://your-plex-server-ip:32400/identity` in your browser
2. Copy the `machineIdentifier` value from the XML response

### Setting Up Trakt API

1. Go to https://trakt.tv/oauth/applications
2. Create a new application
3. Each user will need to provide their own Trakt Client ID and Secret in the web interface

## How It Works

1. **Authentication**: Users authenticate with Plex and configure their Trakt API credentials
2. **Webhooks**: Plex sends webhook events when media is watched
3. **Progress Sync** (Optional):
   - Real-time playback position sync to Trakt (play, pause, resume, stop events)
   - Intelligent throttling to prevent excessive API calls
   - Configurable minimum progress change threshold (default: 5%)
   - Configurable minimum time between updates (default: 5 minutes)
4. **Scrobbling**: When media reaches 90% completion, it's automatically marked as watched on Trakt
5. **Sync History**: All sync attempts are logged with success/failure status for debugging
6. **Token Management**:
   - Access tokens are refreshed automatically when expired (24h)
   - Refresh tokens are kept alive with weekly maintenance (90d expiration)

### Watch Progress Sync

The watch progress sync feature keeps your Trakt playback position in sync with Plex in real-time:

- **Start**: When you start watching, Trakt is notified
- **Pause**: When you pause, the current position is synced to Trakt
- **Resume**: Position updates are sent (respecting throttling settings)
- **Stop**: Final position is synced when you stop playback

This feature is **enabled by default** but can be disabled per user. You can configure:
- Minimum progress change percentage to trigger sync
- Minimum time interval between progress updates

Access these settings in the web interface after logging in.

## Docker Volumes

The application uses a volume for persistent data:

- `./data:/app/data` - SQLite database storage

## License

MIT

## Contributing

Pull requests are welcome! Please open an issue first to discuss major changes.
