# คู่มือการติดตั้ง (Installation Guide)

## สิ่งที่ต้องมีก่อนเริ่ม

- [Node.js](https://nodejs.org/) เวอร์ชัน 18 ขึ้นไป
- [Git](https://git-scm.com/)
- บัญชี [GitHub](https://github.com/) (สำหรับ clone โปรเจกต์)

ตรวจสอบว่าติดตั้งแล้วโดยพิมพ์ในเทอร์มินัล:

```bash
node --version
git --version
```

---

## ขั้นตอนที่ 1: Clone โปรเจกต์

```bash
git clone https://github.com/hellokrisada/Meeting-note.git
cd Meeting-note
```

## ขั้นตอนที่ 2: ติดตั้ง Dependencies ทั้งหมด

รันคำสั่งนี้ครั้งเดียว จะติดตั้งให้ทั้ง root, server และ client:

```bash
npm run install-all
```

## ขั้นตอนที่ 3: ตั้งค่า Environment Variables

### 3.1 ตั้งค่า Server

คัดลอกไฟล์ตัวอย่างแล้วแก้ไข:

```bash
cp .env.example .env
```

เปิดไฟล์ `.env` แล้วแก้ไข:

```
JWT_SECRET=ใส่-secret-key-ของคุณ-ตรงนี้
PORT=3001
```

### 3.2 ตั้งค่า Client

```bash
cp client/.env.example client/.env
```

ไฟล์ `client/.env` จะมีค่าเริ่มต้นสำหรับ local development อยู่แล้ว:

```
VITE_API_URL=http://localhost:3001
```

## ขั้นตอนที่ 4: เริ่มต้นใช้งาน (Local Development)

รันคำสั่งนี้เพื่อเปิดทั้ง server และ client พร้อมกัน:

```bash
npm run dev
```

- Frontend จะเปิดที่: **http://localhost:3000**
- Backend API จะเปิดที่: **http://localhost:3001**

## ขั้นตอนที่ 5: รัน Tests

```bash
# รัน unit tests และ property tests ทั้งหมด
npx jest

# รันเฉพาะ property tests
npx jest tests/property

# รันเฉพาะ unit tests
npx jest tests/unit

# รันเฉพาะ integration tests
npx jest tests/integration
```

---

## การ Deploy บน AWS (สำหรับผู้ดูแลระบบ)

ถ้าต้องการ deploy ขึ้น AWS ด้วย CloudFormation ดูรายละเอียดที่ [infra/README.md](infra/README.md)

สรุปขั้นตอน:

1. สร้าง S3 bucket สำหรับเก็บ Lambda code และ CloudFormation templates
2. อัปโหลด nested stack templates ไปยัง S3
3. Deploy main stack ด้วย `aws cloudformation create-stack`
4. Build frontend แล้วอัปโหลดไปยัง S3 frontend bucket

```bash
# Build frontend สำหรับ production
cd client
npm run build
```

ไฟล์ที่ build แล้วจะอยู่ใน `client/dist/`

---

## โครงสร้างโปรเจกต์

```
Meeting-note/
├── client/               # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── pages/        # หน้าต่างๆ (Login, Register, Meeting, etc.)
│   │   ├── api.ts        # API client สำหรับเรียก backend
│   │   ├── App.tsx       # Router setup
│   │   └── main.tsx      # Entry point
│   └── .env.example
├── services/             # Backend microservices (Lambda handlers)
│   ├── auth/             # ลงทะเบียน / เข้าสู่ระบบ
│   ├── meeting/          # CRUD รายงานการประชุม
│   ├── ai/               # AI สรุปการประชุม
│   └── email/            # ส่งอีเมลสรุป
├── shared/               # Types, validators, constants ที่ใช้ร่วมกัน
├── infra/                # CloudFormation templates
├── tests/                # Tests ทั้งหมด
│   ├── unit/             # Unit tests
│   ├── property/         # Property-based tests
│   └── integration/      # Integration tests
├── .env.example
└── package.json
```

---

## แก้ไขปัญหาเบื้องต้น

| ปัญหา | วิธีแก้ |
|--------|---------|
| `npm run install-all` ล้มเหลว | ลองลบ `node_modules` ทั้งหมดแล้วรันใหม่: `rm -rf node_modules server/node_modules client/node_modules && npm run install-all` |
| Port 3000 หรือ 3001 ถูกใช้งานอยู่ | ปิดโปรแกรมที่ใช้ port นั้น หรือแก้ port ในไฟล์ `.env` และ `client/vite.config.js` |
| Tests ไม่ผ่าน | ตรวจสอบว่ารัน `npm run install-all` แล้ว และอยู่ที่ root directory ของโปรเจกต์ |
