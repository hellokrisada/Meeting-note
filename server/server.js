import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;
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

// Mock flight data generator
const airlines = ['United', 'Delta', 'American', 'Southwest', 'JetBlue'];
const generateFlights = (from, to, date) => {
  return airlines.map((airline, idx) => ({
    id: `${airline}-${Date.now()}-${idx}`,
    airline,
    from,
    to,
    date,
    price: Math.floor(Math.random() * 500) + 100,
    duration: `${Math.floor(Math.random() * 5) + 2}h ${Math.floor(Math.random() * 60)}m`,
    departure: `${Math.floor(Math.random() * 12) + 6}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')} AM`
  }));
};

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

// Register
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

// Login
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

// Search flights
app.get('/api/flights/search', authMiddleware, (req, res) => {
  const { from, to, date } = req.query;
  const flights = generateFlights(from, to, date);
  res.json(flights);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
