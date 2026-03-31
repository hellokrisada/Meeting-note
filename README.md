# Meeting Minutes AI

ระบบบันทึกรายงานการประชุมพร้อม AI สรุปการประชุม และส่งสรุปทางอีเมลอัตโนมัติ บน AWS Serverless Architecture

## Architecture

```mermaid
graph TB
    subgraph Users
        U["👤 Users"]
    end

    subgraph Frontend["☁️ Frontend (No Public IP)"]
        CF["CloudFront CDN<br/>HTTPS Only"]
        S3["S3 Bucket<br/>🔒 Block Public Access"]
        CF -- "OAI" --> S3
    end

    subgraph Security["🛡️ Security Layer"]
        WAF["AWS WAF<br/>Common Rules + Rate Limit"]
    end

    subgraph API["API Layer"]
        APIGW["API Gateway<br/>REST API"]
        COGAUTH["Cognito Authorizer<br/>JWT Validation"]
        APIGW --> COGAUTH
    end

    subgraph AuthMS["Auth Microservice"]
        AUTH_FN["🟠 Auth Lambda"]
        COGNITO["Cognito<br/>User Pool"]
        AUTH_FN --> COGNITO
    end

    subgraph MeetingMS["Meeting Microservice"]
        MEET_FN["🟠 Meeting Lambda"]
        DDB["DynamoDB<br/>🔐 KMS Encrypted"]
        MEET_FN --> DDB
    end

    subgraph AIMS["AI Summarizer Microservice"]
        AI_FN["🟠 AI Lambda"]
        BEDROCK["Amazon Bedrock<br/>Claude Opus"]
        AI_FN --> BEDROCK
    end

    subgraph EmailMS["Email Microservice"]
        EMAIL_FN["🟠 Email Lambda"]
        SES["Amazon SES"]
        EMAIL_FN --> SES
    end

    subgraph Encryption["🔑 Encryption"]
        KMS["AWS KMS<br/>Key Rotation Enabled"]
    end

    U -- "HTTPS" --> CF
    CF -- "API Requests" --> WAF
    WAF --> APIGW
    APIGW -- "/auth/*" --> AUTH_FN
    APIGW -- "/meetings/*" --> MEET_FN
    APIGW -- "/ai/*" --> AI_FN
    APIGW -- "/meetings/*/email" --> EMAIL_FN
    KMS -. "Encryption" .-> DDB

    style Frontend fill:#e8f4fd,stroke:#147EBA
    style Security fill:#fde8e8,stroke:#DD3522
    style AuthMS fill:#fff3e0,stroke:#FF9900
    style MeetingMS fill:#fff3e0,stroke:#FF9900
    style AIMS fill:#fff3e0,stroke:#FF9900
    style EmailMS fill:#fff3e0,stroke:#FF9900
    style Encryption fill:#fce4ec,stroke:#DD344C
```

## Features

- 📝 บันทึกรายงานการประชุม (ผู้ร่วมประชุม, หัวข้อ, ข้อหารือ, Next Steps)
- 🤖 AI สรุปการประชุมด้วย Claude Opus (เลือก model ได้)
- 📧 ส่งสรุปทางอีเมลไปยังผู้เข้าร่วมประชุมอัตโนมัติ
- 🔐 ลงทะเบียน / เข้าสู่ระบบด้วย Cognito
- 📋 จัดการรายงานการประชุม (CRUD)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| Auth | Amazon Cognito (JWT) |
| API | API Gateway + AWS WAF |
| Compute | AWS Lambda (Node.js 20.x) |
| Database | DynamoDB (KMS encrypted) |
| AI | Amazon Bedrock (Claude Opus) |
| Email | Amazon SES |
| CDN | CloudFront + S3 (private) |
| IaC | CloudFormation (nested stacks) |

## Project Structure

```
├── infra/                    # CloudFormation templates
│   ├── main-stack.yaml       # Main stack (API GW, WAF, CloudFront, S3)
│   ├── auth-stack.yaml       # Auth microservice (Cognito + Lambda)
│   ├── meeting-stack.yaml    # Meeting microservice (DynamoDB + Lambda)
│   ├── ai-stack.yaml         # AI microservice (Lambda + Bedrock)
│   ├── email-stack.yaml      # Email microservice (Lambda + SES)
│   └── architecture-diagram.drawio
├── services/
│   ├── auth/                 # Auth Lambda handlers
│   ├── meeting/              # Meeting Lambda handlers
│   ├── ai/                   # AI Summarizer Lambda handlers
│   └── email/                # Email Lambda handlers
├── shared/                   # Shared types, validators, constants
└── client/                   # React frontend (SPA)
```

## Security

- ✅ No public IP exposed (CloudFront + API Gateway only)
- ✅ S3 Block Public Access enabled
- ✅ DynamoDB encrypted with AWS KMS (key rotation)
- ✅ AWS WAF with managed rules + rate limiting
- ✅ IAM least privilege on all Lambda roles
- ✅ HTTPS enforced everywhere
- ✅ X-Ray tracing enabled

## Quick Start

```bash
# 1. Upload nested templates
aws s3 cp infra/auth-stack.yaml s3://$TEMPLATES_BUCKET/
aws s3 cp infra/meeting-stack.yaml s3://$TEMPLATES_BUCKET/
aws s3 cp infra/ai-stack.yaml s3://$TEMPLATES_BUCKET/
aws s3 cp infra/email-stack.yaml s3://$TEMPLATES_BUCKET/

# 2. Deploy
aws cloudformation create-stack \
  --stack-name meeting-minutes-ai \
  --template-body file://infra/main-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
  --parameters \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=LambdaCodeBucket,ParameterValue=$LAMBDA_BUCKET \
    ParameterKey=TemplatesBucket,ParameterValue=$TEMPLATES_BUCKET \
    ParameterKey=SenderEmail,ParameterValue=noreply@yourdomain.com
```

ดูรายละเอียดเพิ่มเติมที่ [infra/README.md](infra/README.md)
