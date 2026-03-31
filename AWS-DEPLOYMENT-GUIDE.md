# คู่มือ Deploy บน AWS สำหรับผู้เริ่มต้น

คู่มือนี้จะพาคุณ deploy ระบบ Meeting Minutes AI ขึ้น AWS ทีละขั้นตอน
ไม่ต้องมีประสบการณ์ AWS มาก่อน แค่ทำตามทีละขั้นได้เลย

---

## สิ่งที่ต้องเตรียม

### 1. สร้างบัญชี AWS

ถ้ายังไม่มีบัญชี AWS:

1. ไปที่ [https://aws.amazon.com](https://aws.amazon.com)
2. กด "Create an AWS Account"
3. กรอกอีเมล, รหัสผ่าน, ชื่อบัญชี
4. กรอกข้อมูลบัตรเครดิต (AWS มี Free Tier ใช้ฟรี 12 เดือน)
5. ยืนยันตัวตนด้วยเบอร์โทร
6. เลือกแผน "Basic Support - Free"

### 2. ติดตั้ง AWS CLI

AWS CLI คือเครื่องมือสำหรับสั่งงาน AWS จากเทอร์มินัล

**macOS:**
```bash
brew install awscli
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:**
ดาวน์โหลดตัวติดตั้งจาก [https://aws.amazon.com/cli/](https://aws.amazon.com/cli/)

ตรวจสอบว่าติดตั้งสำเร็จ:
```bash
aws --version
```

### 3. ตั้งค่า AWS CLI

คุณต้องสร้าง Access Key ก่อน:

1. เข้า [AWS Console](https://console.aws.amazon.com)
2. คลิกชื่อบัญชีมุมขวาบน → "Security credentials"
3. เลื่อนลงไปที่ "Access keys" → "Create access key"
4. เลือก "Command Line Interface (CLI)" → กด "Next" → "Create access key"
5. **บันทึก Access Key ID และ Secret Access Key ไว้** (จะเห็นได้ครั้งเดียว)

จากนั้นตั้งค่าในเทอร์มินัล:
```bash
aws configure
```

ระบบจะถามข้อมูล 4 อย่าง:
```
AWS Access Key ID: ใส่ Access Key ID ที่ได้มา
AWS Secret Access Key: ใส่ Secret Access Key ที่ได้มา
Default region name: ap-southeast-1
Default output format: json
```

> **หมายเหตุ:** `ap-southeast-1` คือ Singapore region ซึ่งใกล้ไทยที่สุด คุณเลือก region อื่นได้ตามต้องการ

ตรวจสอบว่าใช้งานได้:
```bash
aws sts get-caller-identity
```

ถ้าเห็นข้อมูล Account ID แสดงว่าตั้งค่าสำเร็จ

### 4. ติดตั้ง Node.js

ถ้ายังไม่มี ดาวน์โหลดจาก [https://nodejs.org](https://nodejs.org) (เลือก LTS version)

---

## ขั้นตอนที่ 1: เปิดใช้งาน Amazon Bedrock (AI)

Amazon Bedrock ต้องขอเปิดใช้งาน model ก่อน:

1. เข้า [AWS Console](https://console.aws.amazon.com)
2. ค้นหา "Bedrock" ในช่องค้นหาด้านบน → คลิก "Amazon Bedrock"
3. ที่เมนูซ้าย คลิก "Model access"
4. คลิก "Manage model access"
5. เลือก **Anthropic** → ติ๊ก **Claude** models ที่ต้องการ (แนะนำ Claude Opus)
6. คลิก "Request model access"
7. รอ 1-2 นาที สถานะจะเปลี่ยนเป็น "Access granted"

> **สำคัญ:** ถ้าไม่เปิดใช้งาน Bedrock ฟีเจอร์ AI สรุปการประชุมจะใช้ไม่ได้

---

## ขั้นตอนที่ 2: ยืนยันอีเมลใน Amazon SES

Amazon SES ต้องยืนยันอีเมลก่อนจึงจะส่งอีเมลได้:

1. เข้า [AWS Console](https://console.aws.amazon.com) → ค้นหา "SES"
2. คลิก "Amazon Simple Email Service"
3. ที่เมนูซ้าย คลิก "Verified identities"
4. คลิก "Create identity"
5. เลือก "Email address"
6. กรอกอีเมลที่จะใช้เป็นผู้ส่ง เช่น `noreply@yourdomain.com`
7. คลิก "Create identity"
8. ไปเช็คอีเมล → คลิกลิงก์ยืนยัน

> **หมายเหตุ:** บัญชี SES ใหม่จะอยู่ใน "Sandbox mode" ซึ่งส่งอีเมลได้เฉพาะไปยังอีเมลที่ยืนยันแล้วเท่านั้น ถ้าต้องการส่งไปยังอีเมลใดก็ได้ ต้อง [ขอออกจาก Sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

---

## ขั้นตอนที่ 3: สร้าง S3 Buckets

เราต้องสร้าง S3 bucket 2 อัน:
- อันแรก: เก็บ Lambda code (โค้ดที่จะรันบน AWS)
- อันสอง: เก็บ CloudFormation templates (ไฟล์ตั้งค่า infrastructure)

```bash
# เปลี่ยน ACCOUNT_ID เป็นเลข AWS Account ของคุณ (12 หลัก)
# ดูได้จาก: aws sts get-caller-identity --query Account --output text
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-southeast-1

# สร้าง bucket สำหรับ Lambda code
aws s3 mb s3://meeting-minutes-lambda-${ACCOUNT_ID} --region $REGION

# สร้าง bucket สำหรับ CloudFormation templates
aws s3 mb s3://meeting-minutes-templates-${ACCOUNT_ID} --region $REGION
```

ตรวจสอบว่าสร้างสำเร็จ:
```bash
aws s3 ls | grep meeting-minutes
```

ควรเห็น bucket 2 อัน

---

## ขั้นตอนที่ 4: Build และ Upload Lambda Code

Lambda code คือโค้ด backend ที่จะรันบน AWS ต้อง compile TypeScript เป็น JavaScript แล้ว zip ขึ้นไป

```bash
# กลับไปที่ root ของโปรเจกต์
cd Meeting-note

# ติดตั้ง dependencies (ถ้ายังไม่ได้ทำ)
npm run install-all

# ตั้งค่าตัวแปร
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
LAMBDA_BUCKET=meeting-minutes-lambda-${ACCOUNT_ID}
```

### 4.1 Build และ Upload แต่ละ Service

**Auth Service:**
```bash
cd services/auth
npm install
npx tsc
zip -r handler.zip src/ node_modules/ package.json
aws s3 cp handler.zip s3://$LAMBDA_BUCKET/auth/handler.zip
cd ../..
```

**Meeting Service:**
```bash
cd services/meeting
npm install
npx tsc
zip -r handler.zip src/ node_modules/ package.json
aws s3 cp handler.zip s3://$LAMBDA_BUCKET/meeting/handler.zip
cd ../..
```

**AI Service:**
```bash
cd services/ai
npm install
npx tsc
zip -r handler.zip src/ node_modules/ package.json
aws s3 cp handler.zip s3://$LAMBDA_BUCKET/ai/handler.zip
cd ../..
```

**Email Service:**
```bash
cd services/email
npm install
npx tsc
zip -r handler.zip src/ node_modules/ package.json
aws s3 cp handler.zip s3://$LAMBDA_BUCKET/email/handler.zip
cd ../..
```

---

## ขั้นตอนที่ 5: Upload CloudFormation Templates

CloudFormation templates คือไฟล์ที่บอก AWS ว่าต้องสร้างอะไรบ้าง

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
TEMPLATES_BUCKET=meeting-minutes-templates-${ACCOUNT_ID}

aws s3 cp infra/auth-stack.yaml s3://$TEMPLATES_BUCKET/
aws s3 cp infra/meeting-stack.yaml s3://$TEMPLATES_BUCKET/
aws s3 cp infra/ai-stack.yaml s3://$TEMPLATES_BUCKET/
aws s3 cp infra/email-stack.yaml s3://$TEMPLATES_BUCKET/
```

---

## ขั้นตอนที่ 6: Deploy ระบบทั้งหมด

นี่คือขั้นตอนหลัก — สั่งให้ AWS สร้างทุกอย่างให้อัตโนมัติ:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
LAMBDA_BUCKET=meeting-minutes-lambda-${ACCOUNT_ID}
TEMPLATES_BUCKET=meeting-minutes-templates-${ACCOUNT_ID}
SENDER_EMAIL=ใส่อีเมลที่ยืนยันใน-SES-แล้ว

aws cloudformation create-stack \
  --stack-name meeting-minutes-ai \
  --template-body file://infra/main-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
  --parameters \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=LambdaCodeBucket,ParameterValue=$LAMBDA_BUCKET \
    ParameterKey=TemplatesBucket,ParameterValue=$TEMPLATES_BUCKET \
    ParameterKey=SenderEmail,ParameterValue=$SENDER_EMAIL
```

### รอให้ Deploy เสร็จ

การ deploy จะใช้เวลาประมาณ 5-15 นาที ตรวจสอบสถานะ:

```bash
aws cloudformation describe-stacks \
  --stack-name meeting-minutes-ai \
  --query 'Stacks[0].StackStatus' \
  --output text
```

- `CREATE_IN_PROGRESS` = กำลังสร้าง (รอต่อ)
- `CREATE_COMPLETE` = สำเร็จ ✅
- `CREATE_FAILED` = ล้มเหลว ❌ (ดูวิธีแก้ด้านล่าง)

หรือดูสถานะแบบ real-time ใน AWS Console:
1. เข้า [AWS Console](https://console.aws.amazon.com) → ค้นหา "CloudFormation"
2. คลิกที่ stack "meeting-minutes-ai"
3. ดูแท็บ "Events" เพื่อดูความคืบหน้า

---

## ขั้นตอนที่ 7: ดู URL ของระบบ

เมื่อ deploy สำเร็จ ดู URL ต่างๆ:

```bash
# ดู API URL (Backend)
aws cloudformation describe-stacks \
  --stack-name meeting-minutes-ai \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text

# ดู Frontend URL
aws cloudformation describe-stacks \
  --stack-name meeting-minutes-ai \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text
```

**บันทึก API URL ไว้** — จะใช้ในขั้นตอนถัดไป

---

## ขั้นตอนที่ 8: Build และ Upload Frontend

```bash
# กลับไปที่ root ของโปรเจกต์
cd Meeting-note

# ตั้งค่า API URL ใน client/.env
# แทนที่ URL ด้วย API URL ที่ได้จากขั้นตอนที่ 7
echo "VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/dev" > client/.env

# Build frontend
cd client
npm run build
cd ..
```

Upload ไปยัง S3:

```bash
# ดูชื่อ S3 bucket สำหรับ frontend
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name meeting-minutes-ai \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)

# Upload ไฟล์ frontend
aws s3 sync client/dist/ s3://$FRONTEND_BUCKET/

# ล้าง CloudFront cache เพื่อให้เห็นเวอร์ชันใหม่
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name meeting-minutes-ai \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

---

## ขั้นตอนที่ 9: ทดสอบระบบ

1. เปิด Frontend URL ที่ได้จากขั้นตอนที่ 7 ในเบราว์เซอร์
2. ลงทะเบียนบัญชีใหม่
3. ยืนยันอีเมล
4. เข้าสู่ระบบ
5. สร้างรายงานการประชุม
6. ลองสรุปด้วย AI
7. ลองส่งอีเมลสรุป

---

## การลบระบบทั้งหมด (ถ้าต้องการ)

ถ้าต้องการลบทุกอย่างออกจาก AWS:

```bash
# ลบไฟล์ใน S3 ก่อน (CloudFormation ลบ bucket ที่มีไฟล์ไม่ได้)
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name meeting-minutes-ai \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)
aws s3 rm s3://$FRONTEND_BUCKET --recursive

# ลบ CloudFormation stack
aws cloudformation delete-stack --stack-name meeting-minutes-ai

# รอให้ลบเสร็จ
aws cloudformation wait stack-delete-complete --stack-name meeting-minutes-ai

# ลบ S3 buckets ที่สร้างเอง
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 rb s3://meeting-minutes-lambda-${ACCOUNT_ID} --force
aws s3 rb s3://meeting-minutes-templates-${ACCOUNT_ID} --force
```

---

## แก้ไขปัญหาที่พบบ่อย

### ❌ CREATE_FAILED

ดู error ด้วยคำสั่ง:
```bash
aws cloudformation describe-stack-events \
  --stack-name meeting-minutes-ai \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```

### ❌ "S3 bucket does not exist"
ตรวจสอบว่าสร้าง S3 bucket แล้วและชื่อถูกต้อง

### ❌ "Access Denied"
ตรวจสอบว่า AWS CLI ตั้งค่าถูกต้อง และ IAM user มีสิทธิ์เพียงพอ (แนะนำใช้ AdministratorAccess สำหรับการทดสอบ)

### ❌ "Template format error" หรือ "Nested stack failed"
ตรวจสอบว่า upload template files ไปยัง S3 แล้ว (ขั้นตอนที่ 5)

### ❌ Bedrock "Access denied to model"
ตรวจสอบว่าเปิดใช้งาน Bedrock model แล้ว (ขั้นตอนที่ 1)

### ❌ SES "Email address is not verified"
ตรวจสอบว่ายืนยันอีเมลใน SES แล้ว (ขั้นตอนที่ 2)

---

## ค่าใช้จ่ายโดยประมาณ

สำหรับการใช้งานเบื้องต้น (Free Tier eligible):

| Service | Free Tier | หลัง Free Tier |
|---------|-----------|----------------|
| Lambda | 1M requests/เดือน ฟรี | ~$0.20 ต่อ 1M requests |
| DynamoDB | 25GB + 25 WCU/RCU ฟรี | ~$1.25 ต่อ 1M writes |
| API Gateway | 1M calls/เดือน ฟรี (12 เดือน) | ~$3.50 ต่อ 1M calls |
| S3 | 5GB ฟรี | ~$0.025 ต่อ GB |
| CloudFront | 1TB transfer ฟรี (12 เดือน) | ~$0.085 ต่อ GB |
| Cognito | 50,000 MAU ฟรี | ~$0.0055 ต่อ MAU |
| SES | 62,000 emails/เดือน ฟรี (จาก EC2) | ~$0.10 ต่อ 1,000 emails |
| Bedrock (Claude) | ไม่มี Free Tier | ~$15 ต่อ 1M input tokens |

> สำหรับโปรเจกต์ทดสอบ ค่าใช้จ่ายจะอยู่ที่ประมาณ **$0-5 ต่อเดือน** (ส่วนใหญ่จาก Bedrock)
