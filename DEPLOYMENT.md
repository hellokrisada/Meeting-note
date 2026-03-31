# Deployment Guide

This application can be deployed using multiple platforms. Choose the one that fits your needs.

## Option 1: Vercel (Easiest - Free Tier Available)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Set environment variables in Vercel dashboard:
   - `JWT_SECRET`: A random secure string
   - `VITE_API_URL`: Your Vercel backend URL

Note: SQLite won't persist on Vercel. Consider using a hosted database for production.

## Option 2: Render (Recommended for Production)

1. Push your code to GitHub
2. Go to https://render.com and create a new account
3. Click "New +" and select "Blueprint"
4. Connect your GitHub repository
5. Render will automatically detect `render.yaml` and deploy both services

Environment variables are auto-configured via render.yaml.

## Option 3: Docker (Self-Hosted)

### Using Docker Compose (Recommended):

1. Create `.env` file:
```bash
cp .env.example .env
# Edit .env and set JWT_SECRET
```

2. Build and run:
```bash
docker-compose up -d
```

3. Access:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

### Using Single Dockerfile:

```bash
docker build -t flight-search .
docker run -p 3000:3000 -p 3001:3001 flight-search
```

## Option 4: Railway

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login:
```bash
railway login
```

3. Initialize and deploy:
```bash
railway init
railway up
```

4. Set environment variables:
```bash
railway variables set JWT_SECRET=your-secret-here
```

## Option 5: Heroku

1. Install Heroku CLI and login:
```bash
heroku login
```

2. Create app:
```bash
heroku create your-app-name
```

3. Set buildpacks:
```bash
heroku buildpacks:add heroku/nodejs
```

4. Set environment variables:
```bash
heroku config:set JWT_SECRET=your-secret-here
```

5. Deploy:
```bash
git push heroku main
```

## Option 6: DigitalOcean App Platform

1. Push code to GitHub
2. Go to DigitalOcean App Platform
3. Create new app from GitHub repository
4. Configure:
   - Backend: Node.js service (server directory)
   - Frontend: Static site (client directory)
5. Set environment variables in the dashboard

## Production Considerations

### Database
SQLite is great for development but for production consider:
- PostgreSQL (Render, Railway, Heroku offer free tiers)
- MongoDB Atlas (free tier available)
- PlanetScale (MySQL, free tier)

### Environment Variables
Always set these in production:
- `JWT_SECRET`: Use a strong random string (32+ characters)
- `NODE_ENV=production`
- `VITE_API_URL`: Your backend URL

### Security
- Use HTTPS in production
- Set secure CORS origins
- Use strong JWT secrets
- Implement rate limiting
- Add input validation

### Monitoring
Consider adding:
- Error tracking (Sentry)
- Analytics (Google Analytics, Plausible)
- Uptime monitoring (UptimeRobot)

## Quick Deploy Commands

### Vercel:
```bash
vercel --prod
```

### Docker:
```bash
docker-compose up -d
```

### Railway:
```bash
railway up
```

Choose the platform that best fits your needs and budget!
