# How to Access Your Flight Search Application

## Your Server IP: 13.158.138.216

## Application URLs:
- Frontend: http://13.158.138.216:3000
- Backend API: http://13.158.138.216:3001

## Current Status:
✅ Backend server running on port 3001
✅ Frontend server running on port 3000

## If You Can't Access:

### Option 1: Open Firewall Ports (AWS/Cloud)
If you're on AWS EC2 or similar cloud service:

1. Go to your cloud provider's security groups/firewall settings
2. Add inbound rules to allow:
   - Port 3000 (TCP) from 0.0.0.0/0
   - Port 3001 (TCP) from 0.0.0.0/0

### Option 2: Use SSH Tunnel (Quick Access)
From your local machine, run:
```bash
ssh -L 3000:localhost:3000 -L 3001:localhost:3001 user@13.158.138.216
```
Then access: http://localhost:3000

### Option 3: Use Nginx Reverse Proxy (Production)
```bash
sudo apt update
sudo apt install nginx -y
```

Then create this config at `/etc/nginx/sites-available/flight-search`:
```nginx
server {
    listen 80;
    server_name 13.158.138.216;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/flight-search /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Then access: http://13.158.138.216

### Option 4: Check if Ports are Open
```bash
# Check if services are listening
sudo netstat -tlnp | grep -E ':(3000|3001)'

# Check firewall (if using ufw)
sudo ufw status
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
```

## Stopping the Application
To stop the servers, run:
```bash
# Find and kill the processes
pkill -f "node server.js"
pkill -f "vite"
```

## Restarting the Application
```bash
cd ~/PROJECT/Kiro
npm run dev
```

This will start both frontend and backend servers.
