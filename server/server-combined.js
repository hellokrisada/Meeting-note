import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import airports from './airports-data.js';
import { searchFlights } from './flight-api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Simple file-based storage
const DB_FILE = './data/users.json';

// Ensure data directory exists
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data', { recursive: true });
}

// Initialize database file
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Auth middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// API Routes
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const db = readDB();
    
    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now(),
      email,
      password: hashedPassword,
      created_at: new Date().toISOString()
    };
    
    db.users.push(newUser);
    writeDB(db);
    
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET);
    res.json({ token, email });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ token, email });
});

app.get('/api/flights/search', authMiddleware, async (req, res) => {
  const { from, to, date } = req.query;
  
  try {
    const flights = await searchFlights(from, to, date);
    res.json(flights);
  } catch (error) {
    console.error('Flight search error:', error);
    res.status(500).json({ error: 'Failed to search flights' });
  }
});

// Get airports list
app.get('/api/airports', (req, res) => {
  res.json(airports);
});

// Serve static files from client/dist in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Access at: http://13.158.138.216:${PORT}\n`);
});
