# ✈️ Flight Search App - Access Instructions

## 🎉 Your App is Running on Port 8080!

**Access URL:** http://13.158.138.216:8080

---

## ✅ Current Status

- ✅ Backend API running on port 8080
- ✅ Frontend built and served on port 8080
- ✅ Single port for easy access
- ✅ All services combined

---

## 🚨 To Access the Application:

### Option 1: Open Port 8080 in AWS Security Group

1. Go to **AWS Console** → **EC2** → **Security Groups**
2. Find your instance's security group
3. Click **Edit inbound rules**
4. Add rule:
   - **Type:** Custom TCP
   - **Port:** 8080
   - **Source:** 0.0.0.0/0 (or your IP address)
5. **Save rules**
6. Access: **http://13.158.138.216:8080**

### Option 2: SSH Tunnel (No AWS Changes)

From your local computer:
```bash
ssh -i your-key.pem -L 8080:localhost:8080 krisadau@13.158.138.216
```

Then open: **http://localhost:8080**

### Option 3: Test Locally on Server

SSH into your server and test:
```bash
curl http://localhost:8080
```

---

## 📱 How to Use the App

1. **Register:** Create account with email and password
2. **Login:** Sign in with your credentials  
3. **Search Flights:**
   - From: NYC, LAX, SFO, etc.
   - To: Destination airport
   - Date: Select travel date
4. **Compare:** View prices from 5 airlines

---

## 🔧 Server Management

### Check if running:
```bash
ps aux | grep "server-combined"
```

### View logs:
```bash
cd ~/PROJECT/Kiro/server
tail -f nohup.out
```

### Stop server:
```bash
pkill -f "server-combined"
```

### Restart server:
```bash
cd ~/PROJECT/Kiro/server
node server-combined.js
```

### Run in background:
```bash
cd ~/PROJECT/Kiro/server
nohup node server-combined.js > server.log 2>&1 &
```

---

## 🧪 Test the API

```bash
# Test registration
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Test login
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

---

## 🐛 Troubleshooting

### Can't access from browser?
- Check AWS Security Group has port 8080 open
- Or use SSH tunnel (Option 2)

### Server not responding?
```bash
# Check if process is running
ps aux | grep server-combined

# Check port is listening
netstat -tlnp | grep 8080

# Restart server
cd ~/PROJECT/Kiro/server
node server-combined.js
```

### Need to rebuild frontend?
```bash
cd ~/PROJECT/Kiro/client
npm run build
```

---

## 🚀 Production Deployment

For production with HTTPS and domain:
- Use Nginx reverse proxy
- Get SSL certificate (Let's Encrypt)
- Or deploy to Vercel/Render (see DEPLOYMENT.md)

---

**Current Server:** http://13.158.138.216:8080
**Status:** ✅ Running and ready!

Just open port 8080 in AWS Security Group to access from your browser.
