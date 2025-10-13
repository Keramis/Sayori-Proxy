
# Sayori Proxy

A modern API proxy management system for routing and managing multiple AI provider connections with built-in rate limiting, usage tracking, and admin controls.

![Sayori Proxy Dashboard](https://via.placeholder.com/800x400?text=Sayori+Proxy+Dashboard)

## Features

### Core Features
- 🔄 **Multi-Provider Support**: Connect and manage multiple AI providers (OpenAI, Anthropic, Google, etc.)
- 🔑 **API Key Management**: Round-robin key rotation for load distribution
- 📊 **Real-time Statistics**: WebSocket-powered live dashboard with usage metrics
- 🎫 **User Token System**: Generate and manage user access tokens with rate limiting
- 💰 **Request Cost Management**: Configurable cost per model with fractional costs support
- 🚀 **Smart Caching**: 10x cost reduction for identical requests within 5-minute window
- 🛡️ **Rate Limiting**: Requests per day (RPD) and requests per minute (RPM) controls
- 🎨 **Modern UI**: Pink and white themed dashboard with dark mode support

### Authentication Modes
1. **User Token Auth** (default): Token-based access with individual rate limits
2. **General Password**: Single password for all users
3. **No Auth**: Open access mode for development

### Admin Panel Features
- Provider CRUD operations with base URL configuration
- API key management with usage tracking
- Model discovery and configuration
- Bulk model operations (enable/disable/cost updates)
- User token management with quota settings
- Real-time usage statistics

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (optional, uses JSON file by default)

### Local Development

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd sayori-proxy
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Database (optional - leave blank for file-based storage)
DATABASE_URL=postgresql://user:password@localhost:5432/sayori_proxy

# Server
PORT=5000
NODE_ENV=development
```

4. **Start the development server**
```bash
npm run dev
```

5. **Access the application**
- Dashboard: http://localhost:5000
- Admin Panel: http://localhost:5000/admin

## Deployment Guide

### Deploy on Replit (Recommended)

1. **Import to Replit**
   - Go to [Replit](https://replit.com)
   - Click "Create Repl"
   - Select "Import from GitHub"
   - Paste your repository URL

2. **Configure Secrets**
   - Open the Secrets tool (lock icon in sidebar)
   - Add these secrets:
     ```
     ADMIN_USERNAME=your_admin_username
     ADMIN_PASSWORD=your_secure_password
     ```

3. **Deploy**
   - The app will auto-deploy on Replit
   - Access via your Replit URL: `https://your-repl-name.username.repl.co`

### Deploy on VPS

1. **Setup VPS (Ubuntu/Debian)**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2
```

2. **Clone and setup**
```bash
# Clone repository
git clone <your-repo-url>
cd sayori-proxy

# Install dependencies
npm install

# Build the application
npm run build
```

3. **Configure environment**
```bash
# Create production .env
nano .env
```

Add:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
PORT=5000
NODE_ENV=production
```

4. **Start with PM2**
```bash
# Start application
pm2 start npm --name sayori-proxy -- run start

# Enable auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs sayori-proxy
```

5. **Setup Nginx (optional)**
```bash
sudo apt install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/sayori-proxy
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/sayori-proxy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Deploy on Render.com

1. **Create New Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - **Name**: sayori-proxy
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Free or paid

3. **Add Environment Variables**
   ```
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your-secure-password
   PORT=5000
   NODE_ENV=production
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Access via: `https://sayori-proxy.onrender.com`

## Usage Guide

### 1. Initial Setup (Admin)

1. **Login to Admin Panel**
   - Navigate to `/admin`
   - Login with credentials from `.env`

2. **Add AI Provider**
   - Click "Add Provider"
   - Enter provider name (e.g., "OpenAI")
   - Enter base URL (e.g., `https://api.openai.com/v1`)
   - Click "Add Provider"

3. **Add API Keys**
   - Select your provider
   - Click "Add API Key"
   - Paste your API key
   - Repeat for multiple keys (for rotation)

4. **Discover Models**
   - Click "Check Available Models"
   - Models will be auto-discovered and added
   - Enable/disable models as needed
   - Set request costs (default: 1 request per use)

5. **Create User Token**
   - Go to "User Tokens" tab
   - Click "Add User Token"
   - Enter name (e.g., "Production API")
   - Set max requests per day (maxRPD)
   - Set max requests per minute (maxRPM)
   - Copy the generated token

### 2. Using the Proxy (Users)

#### Check Token Stats
1. Go to homepage
2. Click "Check Your User Token"
3. Enter your token
4. View usage statistics

#### API Integration

**Endpoint**: `https://your-domain.com/v1/chat/completions`

**Example Request**:
```bash
curl https://your-domain.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -d '{
    "model": "gpt-4 (OpenAI)",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7
  }'
```

**Model Format**:
- Full: `modelId (Provider Name)` - e.g., `gpt-4 (OpenAI)`
- Short: `modelId` - e.g., `gpt-4`

**Supported Parameters**:
- `model` (required)
- `messages` (required)
- `temperature`
- `max_tokens`
- `top_p`
- `stream` (for streaming responses)

### 3. Advanced Features

#### Request Cost System
- Each model has a configurable cost (default: 1)
- Cached identical requests cost 1/10 of original (cached for 5 minutes)
- Fractional costs are supported (e.g., 0.1, 0.5)
- Daily quota is calculated: `used_cost + new_request_cost <= maxRPD`

**Example**:
- Model cost: 1 request
- User sends identical request twice within 5 min
  - 1st request: costs 1.0 (total: 1.0)
  - 2nd request: costs 0.1 (total: 1.1)

#### Rate Limiting
- **Per Day (RPD)**: Total requests per 24 hours
- **Per Minute (RPM)**: Requests in last 60 seconds
- Costs are counted fractionally for accurate quota tracking

#### Quota Validation
- Before processing: checks if remaining quota >= request cost
- If insufficient: returns `429` with details:
  ```json
  {
    "error": "Daily quota is insufficient",
    "details": {
      "required": 1.0,
      "remaining": 0.6,
      "maxRPD": 50,
      "used": 49.4
    }
  }
  ```

## API Reference

### Admin Endpoints

All admin endpoints require Basic authentication.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/providers` | List providers |
| POST | `/api/admin/providers` | Create provider |
| PATCH | `/api/admin/providers/:id` | Update provider |
| DELETE | `/api/admin/providers/:id` | Delete provider |
| GET | `/api/admin/providers/:id/keys` | List API keys |
| POST | `/api/admin/providers/:id/keys` | Add API key |
| DELETE | `/api/admin/keys/:id` | Delete API key |
| GET | `/api/admin/providers/:id/models` | List models |
| POST | `/api/admin/providers/:id/check-models` | Discover models |
| PATCH | `/api/admin/models/:id` | Update model |
| DELETE | `/api/admin/models/:id` | Delete model |
| GET | `/api/admin/tokens` | List user tokens |
| POST | `/api/admin/tokens` | Create user token |
| DELETE | `/api/admin/tokens/:id` | Delete user token |

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Get proxy statistics |
| GET | `/api/providers/public` | List enabled providers |
| POST | `/api/token/stats` | Get token usage stats |
| GET | `/v1/models` | List available models |
| POST | `/v1/chat/completions` | Proxy chat completion |

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **UI**: Shadcn/ui + Tailwind CSS
- **State**: TanStack Query
- **Real-time**: WebSocket
- **Storage**: JSON file (PostgreSQL ready)

### Project Structure
```
sayori-proxy/
├── client/           # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── pages/       # Route pages
│       └── lib/         # Utils & API
├── server/           # Express backend
│   ├── index.ts      # Entry point
│   ├── routes.ts     # API routes
│   └── storage.ts    # Data layer
├── shared/           # Shared types
│   └── schema.ts     # Zod schemas
└── database.json     # File-based storage
```

## Troubleshooting

### Common Issues

**Issue**: Models not loading
- **Solution**: Check provider base URL format (should end with `/v1` or be just the base)

**Issue**: API key rotation not working
- **Solution**: Add multiple API keys to enable round-robin

**Issue**: Rate limit errors
- **Solution**: Check user token maxRPD/maxRPM settings and current usage

**Issue**: WebSocket connection fails
- **Solution**: Ensure `/ws/stats` path is accessible and not blocked by reverse proxy

### Development Tips

1. **Enable debug logging**:
   ```bash
   NODE_ENV=development npm run dev
   ```

2. **Reset database**:
   ```bash
   rm database.json
   # Restart server to create fresh database
   ```

3. **Test with curl**:
   ```bash
   # Test auth
   curl -X POST http://localhost:5000/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin"}'
   ```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Documentation: See this README

---

**Guide created by Claude**
