# 🔑 Quick API Setup Guide

## 🎯 Choose Your Option

### Option 1: Keep Using Mock Data (Current) ✅
**No setup needed!** Your app is already working with realistic mock flight data.

### Option 2: Get Real Flight Data from Google Flights 🚀

**Step 1:** Get SerpAPI Key (2 minutes)
1. Go to: https://serpapi.com/users/sign_up
2. Sign up with email (free account)
3. Verify email
4. Go to dashboard: https://serpapi.com/dashboard
5. Copy your API key

**Step 2:** Configure Server
```bash
cd ~/PROJECT/Kiro/server
nano .env
```

Add these lines:
```env
FLIGHT_API_PROVIDER=serpapi
SERPAPI_KEY=paste_your_key_here
JWT_SECRET=your-secret-key-change-in-production
PORT=8080
```

Save: `Ctrl+X`, then `Y`, then `Enter`

**Step 3:** Restart Server
```bash
# Stop current server
pkill -f "server-combined"

# Start with new config
node server-combined.js
```

**Done!** Now you have real Google Flights data!

---

## 📊 What You Get

### With Mock Data (Current):
- ✅ Works immediately
- ✅ Unlimited searches
- ✅ 5-10 airlines per search
- ✅ Realistic prices ($150-$1000)
- ✅ Random flight times
- ❌ Not real data

### With SerpAPI (Google Flights):
- ✅ Real flight prices
- ✅ Actual schedules
- ✅ Live availability
- ✅ Direct booking links
- ✅ 100 free searches/month
- ✅ Same airlines as Google Flights

---

## 🆓 Free Tier Limits

**SerpAPI Free:**
- 100 searches per month
- No credit card required
- Perfect for testing/demo
- Upgrade: $50/month for 5,000 searches

**Mock Data:**
- Unlimited forever
- No registration
- No costs

---

## 🧪 Test It

After setup, test with:
```bash
# Check if API is working
curl "http://localhost:8080/api/flights/search?from=JFK&to=LAX&date=2026-03-15" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔄 Switch Back to Mock

Edit `.env`:
```env
FLIGHT_API_PROVIDER=mock
```

Restart server.

---

## 💡 Recommendation

**For Demo/Development:** Use mock data (current setup)
**For Production:** Get SerpAPI key for real data

Your app works great with both! 🎉
