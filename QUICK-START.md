# ✈️ Flight Search App - Quick Start

## 🎯 Your Application is Running!

**Server IP:** 13.158.138.216
**Frontend:** http://13.158.138.216:3000
**Backend:** http://13.158.138.216:3001/api

---

## 🚨 Can't Access? Follow These Steps:

### Step 1: Open Ports in AWS Security Group

Since you're on AWS (ip-10-1-1-7), you need to configure your EC2 Security Group:

1. **Go to AWS Console** → EC2 → Security Groups
2. **Find your instance's security group**
3. **Add Inbound Rules:**
   - Type: Custom TCP
   - Port: 3000
   - Source: 0.0.0.0/0 (or your IP for security)
   
   - Type: Custom TCP  
   - Port: 3001
   - Source: 0.0.0.0/0 (or your IP for security)

4. **Save rules**
5. **Try accessing:** http://13.158.138.216:3000

---

### Step 2: Alternative - Use SSH Tunnel (No AWS Changes Needed)

If you can't modify AWS settings, use SSH tunneling from your local computer:

```bash
ssh -i your-key.pem -L 3000:localhost:3000 -L 3001:localhost:3001 krisadau@13.158.138.216
```

Then open in your browser: **http://localhost:3000**

---

### Step 3: Test Backend API

Test if the backend is working:

```bash
curl http://localhost:3001/api/flights/search?from=NYC&to=LAX&date=2026-03-01
```

---

## 📱 Using the Application

1. **Register** a new account with email and password
2. **Login** with your credentials
3. **Search flights** by entering:
   - From: Source airport (e.g., NYC, LAX, SFO)
   - To: Destination airport
   - Date: Travel date
4. **Compare prices** across 5 airlines

---

## 🛠️ Managing the Application

### Check if running:
```bash
ps aux | grep -E "(node server|vite)"
```

### Stop the application:
```bash
pkill -f "node server.js"
pkill -f "vite"
```

### Restart the application:
```bash
cd ~/PROJECT/Kiro
npm run dev
```

---

## 🐳 Production Deployment

For production, use the deployment options in `DEPLOYMENT.md`:
- Docker (recommended)
- Vercel (easiest)
- Render (free tier)
- Railway

---

## 📞 Need Help?

The servers are confirmed running on:
- ✅ Backend: 0.0.0.0:3001
- ✅ Frontend: 0.0.0.0:3000

The issue is network access. Follow Step 1 or Step 2 above to access your application.
