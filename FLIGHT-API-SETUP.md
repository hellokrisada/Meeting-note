# ✈️ Flight Search API Integration

## 🔌 API Providers Supported

Your application now supports **3 flight search providers**:

1. **SerpAPI** (Google Flights Scraper) - Recommended
2. **Amadeus API** (Official Travel API)
3. **Mock Data** (Default - No API key needed)

## 🚀 Quick Start

### Option 1: Use Mock Data (No Setup Required)

The app works out of the box with realistic mock flight data. No API keys needed!

```bash
# Already configured by default
FLIGHT_API_PROVIDER=mock
```

### Option 2: Use SerpAPI (Google Flights)

**Best for:** Real Google Flights data with pricing

1. **Get API Key:**
   - Visit: https://serpapi.com/
   - Sign up for free account (100 searches/month free)
   - Get your API key from dashboard

2. **Configure:**
   ```bash
   cd server
   cp .env.example .env
   ```

3. **Edit `.env` file:**
   ```env
   FLIGHT_API_PROVIDER=serpapi
   SERPAPI_KEY=your_actual_api_key_here
   ```

4. **Restart server:**
   ```bash
   node server-combined.js
   ```

### Option 3: Use Amadeus API

**Best for:** Official airline data, booking capabilities

1. **Get API Credentials:**
   - Visit: https://developers.amadeus.com/
   - Create free account
   - Create new app to get Client ID and Secret

2. **Configure `.env`:**
   ```env
   FLIGHT_API_PROVIDER=amadeus
   AMADEUS_CLIENT_ID=your_client_id
   AMADEUS_CLIENT_SECRET=your_client_secret
   ```

3. **Restart server**

## 📊 API Comparison

| Feature | SerpAPI | Amadeus | Mock |
|---------|---------|---------|------|
| Real Data | ✅ Yes | ✅ Yes | ❌ No |
| Free Tier | 100/month | 2000/month | ♾️ Unlimited |
| Setup Time | 2 min | 5 min | 0 min |
| Google Flights Data | ✅ Yes | ❌ No | ❌ No |
| Booking Links | ✅ Yes | ⚠️ Limited | ✅ Yes |
| Global Coverage | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| Response Time | ~2-3s | ~1-2s | <100ms |

## 🔧 Configuration Details

### Environment Variables

Create `server/.env` file:

```env
# Server Configuration
JWT_SECRET=your-secret-key-here
PORT=8080

# Flight Search API
FLIGHT_API_PROVIDER=mock  # Options: mock, serpapi, amadeus

# SerpAPI Configuration (if using serpapi)
SERPAPI_KEY=your_serpapi_key_here

# Amadeus Configuration (if using amadeus)
AMADEUS_CLIENT_ID=your_amadeus_client_id
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret
```

## 📝 API Response Format

All providers return flights in this format:

```json
{
  "id": "UA-1234567890-0",
  "airline": "United",
  "airlineCode": "UA",
  "bookingUrl": "https://www.united.com",
  "from": "JFK",
  "to": "LAX",
  "date": "2026-03-15",
  "price": 299,
  "duration": "5h 30m",
  "departure": "08:00",
  "arrival": "11:30",
  "stops": 0,
  "class": "Economy"
}
```

## 🎯 Features

### Current Features:
- ✅ Real-time flight search
- ✅ Price comparison
- ✅ Multiple airlines
- ✅ Direct booking links
- ✅ 144 international airports
- ✅ Automatic fallback to mock data

### With Real APIs:
- ✅ Live pricing
- ✅ Actual flight schedules
- ✅ Real availability
- ✅ Multiple cabin classes
- ✅ Layover information
- ✅ Airline logos

## 🔐 API Key Security

**Important:** Never commit API keys to git!

```bash
# .gitignore already includes:
.env
*.env
```

## 📈 API Limits

### SerpAPI Free Tier:
- 100 searches per month
- No credit card required
- Upgrade: $50/month for 5,000 searches

### Amadeus Free Tier:
- 2,000 API calls per month
- Test environment
- Production requires approval

### Mock Data:
- Unlimited searches
- No rate limits
- Perfect for development

## 🧪 Testing

Test the API:

```bash
# Test with mock data
curl "http://localhost:8080/api/flights/search?from=JFK&to=LAX&date=2026-03-15" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check current provider
curl "http://localhost:8080/api/health"
```

## 🐛 Troubleshooting

### "SERPAPI_KEY not configured"
- Make sure `.env` file exists in `server/` directory
- Check that `SERPAPI_KEY` is set correctly
- Restart the server after changing `.env`

### "Amadeus credentials not configured"
- Verify both `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are set
- Check credentials are from test environment
- Restart server

### Falling back to mock data
- This is normal if API fails or keys are invalid
- Check server logs for specific error messages
- Verify API key is active and has remaining quota

## 🔄 Switching Providers

You can switch providers anytime:

1. Edit `server/.env`
2. Change `FLIGHT_API_PROVIDER` value
3. Restart server

```bash
# Switch to SerpAPI
FLIGHT_API_PROVIDER=serpapi

# Switch to Amadeus
FLIGHT_API_PROVIDER=amadeus

# Switch to Mock
FLIGHT_API_PROVIDER=mock
```

## 📚 API Documentation

- **SerpAPI:** https://serpapi.com/google-flights-api
- **Amadeus:** https://developers.amadeus.com/self-service/category/flights
- **Mock:** Built-in, no documentation needed

## 💡 Recommendations

### For Development:
Use **Mock** - Fast, free, unlimited

### For Production (Small Scale):
Use **SerpAPI** - Easy setup, Google Flights data

### For Production (Large Scale):
Use **Amadeus** - Official data, higher limits, booking capabilities

## 🎉 Next Steps

1. Choose your provider
2. Get API credentials (if needed)
3. Configure `.env` file
4. Restart server
5. Start searching real flights!

---

**Current Status:** Using **mock** provider (default)
**Server:** http://13.158.138.216:8080
**API Endpoint:** `/api/flights/search`
