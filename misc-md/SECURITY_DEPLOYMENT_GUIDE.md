# Duration.Finance Security & Deployment Separation Guide

**Version**: 1.0  
**Target**: Production Deployment  
**Security Level**: High  
**Compliance**: DeFi Best Practices  

---

## Security Architecture Overview

Duration.Finance implements a multi-layered security architecture with clear separation between development, testing, and production environments.

### Security Principles
- **Defense in Depth**: Multiple security layers
- **Principle of Least Privilege**: Minimal access rights
- **Zero Trust**: Verify everything, trust nothing
- **Fail Secure**: Secure defaults, graceful failures

---

## 1. Environment Separation Strategy

### 1.1 Environment Classifications

#### **Development Environment**
```bash
# Local development only
NODE_ENV=development
NEXT_PUBLIC_APP_ENV=development
DATABASE_URL=postgresql://duration_dev:duration_dev_password@localhost:5433/duration_finance_dev
PRIVATE_KEY=0x... # Test key, not real funds
BASE_RPC_URL=http://127.0.0.1:8545 # Local node
SECURITY_STRICT_MODE=false
```

#### **Staging/Testnet Environment**
```bash
# Base Sepolia testnet
NODE_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
DATABASE_URL=postgresql://staging_user:secure_staging_password@staging-db:5432/duration_staging
PRIVATE_KEY=0x... # Testnet key with test ETH only
BASE_RPC_URL=https://sepolia.base.org
SECURITY_STRICT_MODE=true
NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=0x...
```

#### **Production Environment**
```bash
# Base mainnet - MAXIMUM SECURITY
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
DATABASE_URL=postgresql://prod_user:ultra_secure_password@prod-db:5432/duration_production
PRIVATE_KEY=${VAULT_PRIVATE_KEY} # From secure vault
BASE_RPC_URL=https://api.developer.coinbase.com/rpc/v1/base/${API_KEY}
SECURITY_STRICT_MODE=true
ENABLE_AUDIT_LOGGING=true
```

### 1.2 Access Control Matrix

| Component | Development | Staging | Production |
|-----------|-------------|---------|------------|
| Database | Local access | VPN only | Private subnet |
| API Keys | Mock/test keys | Limited keys | Production keys |
| Private Keys | Test keys | Testnet keys | Hardware/vault |
| Logging | Console only | File + remote | Secure remote |
| Monitoring | None | Basic | Full SOC |

---

## 2. Smart Contract Security

### 2.1 Security Audit Checklist

#### **Pre-Deployment Security Review**

**Smart Contract Vulnerabilities**:
- [ ] **Reentrancy Protection**: All state-changing functions protected
- [ ] **Integer Overflow/Underflow**: Use SafeMath or Solidity 0.8+
- [ ] **Access Control**: Proper role-based permissions
- [ ] **Front-running Protection**: MEV resistance measures
- [ ] **Flash Loan Attacks**: Position validation logic
- [ ] **Oracle Manipulation**: Price feed security
- [ ] **Governance Attacks**: No governance = no attack surface ✅

**Code Quality Checks**:
```bash
# Run static analysis
slither src/DurationOptions.sol
mythril analyze src/DurationOptions.sol

# Gas optimization
forge snapshot
forge test --gas-report

# Code coverage
forge coverage --report lcov
```

#### **Security Configuration**

**DurationOptions.sol Security Settings**:
```solidity
// Position limits (configurable by owner)
uint256 public minOptionSize = 0.001 ether;
uint256 public maxOptionSize = 1 ether;

// Safety margins
uint256 public constant SAFETY_MARGIN = 10; // 0.1%
uint256 public constant MAX_SLIPPAGE = 500; // 5%

// Emergency controls
bool public emergencyPaused = false;
mapping(address => bool) public emergencyOperators;
```

### 2.2 Deployment Security Protocol

#### **Secure Deployment Process**:

1. **Pre-deployment Verification**:
   ```bash
   # Compile with optimizations
   forge build --optimize --optimizer-runs 200
   
   # Run full test suite
   forge test -vvv
   
   # Generate deployment artifacts
   forge script script/DeployDurationFinance.s.sol --dry-run
   ```

2. **Staged Deployment**:
   ```bash
   # 1. Deploy to testnet first
   forge script script/DeployDurationFinance.s.sol \
     --rpc-url $BASE_TESTNET_RPC_URL \
     --broadcast --verify
   
   # 2. Test all functionality on testnet
   npm run test:integration:testnet
   
   # 3. Deploy to mainnet after approval
   forge script script/DeployDurationFinance.s.sol \
     --rpc-url $BASE_RPC_URL \
     --broadcast --verify \
     --private-key $SECURE_PRIVATE_KEY
   ```

3. **Post-deployment Verification**:
   ```bash
   # Verify contract source code
   forge verify-contract $CONTRACT_ADDRESS \
     src/DurationOptions.sol:DurationOptions \
     --chain-id 8453 \
     --constructor-args $(cast abi-encode "constructor()")
   ```

### 2.3 Smart Contract Security Hardening

#### **Access Control Implementation**:
```solidity
// contracts/security/AccessControl.sol
pragma solidity ^0.8.20;

contract DurationOptionsSecure {
    // Multi-sig for critical operations
    address public constant MULTISIG_WALLET = 0x...;
    
    // Time-delayed admin operations
    uint256 public constant ADMIN_TIMELOCK = 24 hours;
    mapping(bytes32 => uint256) public pendingOperations;
    
    modifier onlyMultisig() {
        require(msg.sender == MULTISIG_WALLET, "Not multisig");
        _;
    }
    
    modifier timelocked(bytes32 operation) {
        require(
            pendingOperations[operation] != 0 && 
            block.timestamp >= pendingOperations[operation],
            "Operation not ready"
        );
        delete pendingOperations[operation];
        _;
    }
}
```

#### **Emergency Response System**:
```solidity
// Emergency pause functionality
function emergencyPause() external onlyMultisig {
    _pause();
    emit EmergencyPaused(msg.sender, block.timestamp);
}

// Gradual unpause with verification
function emergencyUnpause() external onlyMultisig timelocked(keccak256("UNPAUSE")) {
    _unpause();
    emit EmergencyUnpaused(msg.sender, block.timestamp);
}
```

---

## 3. API Security Architecture

### 3.1 API Security Layers

#### **Layer 1: Network Security**
```nginx
# nginx.conf - Rate limiting and DDoS protection
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=x402:10m rate=1r/s;
    
    server {
        listen 443 ssl http2;
        ssl_certificate /etc/ssl/certs/duration.finance.crt;
        ssl_certificate_key /etc/ssl/private/duration.finance.key;
        
        # Security headers
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000";
        
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
        }
        
        location /api/x402/ {
            limit_req zone=x402 burst=5 nodelay;
            proxy_pass http://backend;
        }
    }
}
```

#### **Layer 2: Application Security**
```typescript
// middleware/security.ts
export class SecurityMiddleware {
    static validateRequest(req: Request): boolean {
        // Origin validation
        const allowedOrigins = [
            'https://duration.finance',
            'https://staging.duration.finance',
            process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
        ].filter(Boolean);
        
        const origin = req.headers.origin;
        if (!allowedOrigins.includes(origin)) {
            throw new Error('Invalid origin');
        }
        
        // User-Agent validation (block bots/scrapers)
        const userAgent = req.headers['user-agent'] || '';
        const blockedAgents = [
            'curl', 'wget', 'python-requests', 'postman', 'insomnia'
        ];
        
        if (blockedAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
            throw new Error('Automated access blocked');
        }
        
        return true;
    }
    
    static async validatePayment(req: Request): Promise<boolean> {
        // x402 payment validation
        const paymentHash = req.headers['x-payment-hash'];
        if (!paymentHash) return false;
        
        // Verify USDC payment on-chain
        const payment = await verifyUSDCPayment(paymentHash);
        return payment.amount >= 1e6 && payment.recipient === X402_RECIPIENT;
    }
}
```

#### **Layer 3: Data Validation & Sanitization**
```typescript
// validation/schemas.ts
import { z } from 'zod';

export const CommitmentSchema = z.object({
    creator: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    asset: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    amount: z.string().regex(/^\d+$/),
    premiumAmount: z.string().regex(/^\d+$/),
    minDurationDays: z.number().min(1).max(365),
    maxDurationDays: z.number().min(1).max(365),
    optionType: z.enum(['0', '1']),
    commitmentType: z.enum(['0', '1']),
    expiry: z.number().min(Date.now() / 1000),
    nonce: z.string().regex(/^\d+$/),
    signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/)
});

export const validateCommitment = (data: unknown) => {
    return CommitmentSchema.parse(data);
};
```

### 3.2 Authentication & Authorization

#### **JWT Implementation**:
```typescript
// auth/jwt.ts
import jwt from 'jsonwebtoken';

export class JWTAuth {
    private static readonly SECRET = process.env.JWT_SECRET!;
    private static readonly EXPIRY = '1h';
    
    static generateToken(address: string): string {
        return jwt.sign(
            { 
                address: address.toLowerCase(),
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            },
            this.SECRET,
            { algorithm: 'HS256' }
        );
    }
    
    static verifyToken(token: string): { address: string } {
        try {
            const payload = jwt.verify(token, this.SECRET) as any;
            return { address: payload.address };
        } catch (error) {
            throw new Error('Invalid token');
        }
    }
}
```

#### **Role-Based Access Control**:
```typescript
// auth/rbac.ts
export enum Role {
    USER = 'user',
    ADMIN = 'admin',
    EMERGENCY_OPERATOR = 'emergency'
}

export class RBAC {
    private static roles: Map<string, Role[]> = new Map();
    
    static hasPermission(address: string, requiredRole: Role): boolean {
        const userRoles = this.roles.get(address.toLowerCase()) || [Role.USER];
        return userRoles.includes(requiredRole);
    }
    
    static requireRole(role: Role) {
        return (req: Request, res: Response, next: NextFunction) => {
            const userAddress = req.user?.address;
            if (!userAddress || !this.hasPermission(userAddress, role)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            next();
        };
    }
}
```

---

## 4. Database Security

### 4.1 Database Hardening

#### **PostgreSQL Security Configuration**:
```sql
-- postgresql.conf security settings
ssl = on
ssl_cert_file = '/etc/ssl/certs/postgresql.crt'
ssl_key_file = '/etc/ssl/private/postgresql.key'
ssl_ca_file = '/etc/ssl/certs/ca-certificate.crt'

-- Authentication
password_encryption = scram-sha-256
row_security = on

-- Logging
log_connections = on
log_disconnections = on
log_statement = 'mod'
log_min_duration_statement = 1000

-- Resource limits
max_connections = 100
shared_buffers = 256MB
work_mem = 4MB
```

#### **User Privilege Separation**:
```sql
-- Create separate users for different functions
CREATE USER duration_app WITH PASSWORD 'secure_app_password';
CREATE USER duration_readonly WITH PASSWORD 'secure_readonly_password';
CREATE USER duration_admin WITH PASSWORD 'secure_admin_password';

-- Grant minimal necessary privileges
GRANT SELECT, INSERT, UPDATE ON commitments TO duration_app;
GRANT SELECT, INSERT, UPDATE ON active_options TO duration_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO duration_readonly;

-- Row-level security
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commitment_isolation ON commitments
    FOR ALL TO duration_app
    USING (lp_address = current_setting('app.current_user')::text);
```

### 4.2 Data Encryption & Protection

#### **Encryption at Rest**:
```bash
# Enable PostgreSQL data encryption
initdb --auth-host=scram-sha-256 --auth-local=scram-sha-256 \
       --pwfile=password_file \
       --encoding=UTF8 \
       --data-checksums
```

#### **Sensitive Data Handling**:
```typescript
// crypto/encryption.ts
import crypto from 'crypto';

export class DataEncryption {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly KEY = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32);
    
    static encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.ALGORITHM, this.KEY);
        cipher.setAAD(Buffer.from('duration-finance'));
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }
    
    static decrypt(encryptedText: string): string {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipher(this.ALGORITHM, this.KEY);
        decipher.setAAD(Buffer.from('duration-finance'));
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}
```

---

## 5. Infrastructure Security

### 5.1 Docker Security Configuration

#### **Secure Dockerfile**:
```dockerfile
# Dockerfile.production
FROM node:20-alpine AS builder

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init

# Build application
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app .

# Security: run as non-root
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000
CMD ["dumb-init", "node", "server.js"]
```

#### **Docker Compose Security**:
```yaml
# docker-compose.production.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.production
    environment:
      - NODE_ENV=production
      - DATABASE_URL_FILE=/run/secrets/db_url
    secrets:
      - db_url
      - jwt_secret
      - encryption_key
    networks:
      - internal
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=1G

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=duration_production
      - POSTGRES_USER_FILE=/run/secrets/db_user
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data:Z
    networks:
      - internal
    command: [
      "postgres",
      "-c", "ssl=on",
      "-c", "ssl_cert_file=/etc/ssl/certs/server.crt",
      "-c", "ssl_key_file=/etc/ssl/private/server.key"
    ]

networks:
  internal:
    driver: bridge
    internal: true

secrets:
  db_url:
    external: true
  db_user:
    external: true
  db_password:
    external: true
  jwt_secret:
    external: true
  encryption_key:
    external: true

volumes:
  postgres_data:
    driver: local
```

### 5.2 Monitoring & Alerting

#### **Security Monitoring**:
```typescript
// monitoring/security.ts
export class SecurityMonitor {
    static async logSecurityEvent(event: SecurityEvent): Promise<void> {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: event.severity,
            type: 'security',
            event: event.type,
            details: event.details,
            source_ip: event.sourceIP,
            user_agent: event.userAgent,
            user_address: event.userAddress
        };
        
        // Log to secure remote service
        await this.sendToSecurityLog(logEntry);
        
        // Alert on critical events
        if (event.severity === 'critical') {
            await this.sendAlert(logEntry);
        }
    }
    
    private static async sendAlert(event: SecurityEvent): Promise<void> {
        // Send to incident response system
        const alert = {
            title: `Security Alert: ${event.type}`,
            description: event.details,
            severity: event.severity,
            timestamp: Date.now()
        };
        
        await fetch(process.env.SECURITY_WEBHOOK_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(alert)
        });
    }
}
```

#### **Health Monitoring**:
```typescript
// api/health/route.ts
export async function GET() {
    const health = {
        status: 'healthy',
        timestamp: Date.now(),
        version: process.env.APP_VERSION,
        environment: process.env.NODE_ENV,
        checks: {
            database: await checkDatabase(),
            oneInch: await check1inchAPI(),
            smartContract: await checkSmartContract(),
            redis: await checkRedis()
        }
    };
    
    const allHealthy = Object.values(health.checks).every(check => check.status === 'ok');
    
    return Response.json(health, {
        status: allHealthy ? 200 : 503
    });
}
```

---

## 6. Incident Response Plan

### 6.1 Security Incident Classification

#### **Severity Levels**:
- **P0 - Critical**: Active exploit, funds at risk
- **P1 - High**: Security vulnerability discovered
- **P2 - Medium**: Potential security issue
- **P3 - Low**: Security enhancement

#### **Response Team**:
- **Incident Commander**: Technical lead
- **Security Engineer**: Vulnerability assessment
- **DevOps Engineer**: Infrastructure response
- **Communications**: User/community updates

### 6.2 Emergency Response Procedures

#### **P0 Critical Incident Response**:
```bash
# 1. Immediate containment (within 5 minutes)
# Pause smart contract
cast send $DURATION_OPTIONS_ADDRESS "emergencyPause()" \
  --private-key $EMERGENCY_PRIVATE_KEY \
  --rpc-url $BASE_RPC_URL

# 2. Isolate affected systems
docker-compose down
systemctl stop nginx

# 3. Preserve evidence
pg_dump $DATABASE_URL > incident_$(date +%s).sql
docker logs duration_app > app_logs_$(date +%s).log
```

#### **Communication Templates**:
```markdown
# P0 Incident Notification
Subject: [URGENT] Duration.Finance Security Incident - Service Temporarily Paused

Dear Duration.Finance Community,

We have identified a potential security issue and have temporarily paused 
the protocol as a precautionary measure. No user funds are at risk.

Current Status:
- All smart contract operations paused
- Investigation in progress
- User funds remain secure

We will provide updates every 30 minutes until resolved.

Follow: @DurationFinance for real-time updates
```

---

## 7. Deployment Checklist

### 7.1 Pre-Production Security Checklist

#### **Smart Contract Security**:
- [ ] **External audit completed** by reputable firm
- [ ] All high/critical findings addressed
- [ ] Test suite coverage > 95%
- [ ] Formal verification completed (if applicable)
- [ ] Multi-sig wallet configured for admin functions
- [ ] Timelock implemented for critical operations
- [ ] Emergency pause functionality tested

#### **Infrastructure Security**:
- [ ] SSL/TLS certificates installed and configured
- [ ] Database encryption at rest enabled
- [ ] All secrets stored in secure vault
- [ ] Network segmentation implemented
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery procedures tested
- [ ] DDoS protection enabled

#### **Application Security**:
- [ ] All environment variables secured
- [ ] API rate limiting configured
- [ ] Input validation implemented
- [ ] SQL injection protection verified
- [ ] XSS protection enabled
- [ ] CSRF protection implemented
- [ ] Security headers configured

### 7.2 Production Deployment Protocol

#### **Deployment Steps**:
```bash
# 1. Final security verification
npm run security:audit
npm run test:security

# 2. Build production images
docker build -t duration-finance:production -f Dockerfile.production .

# 3. Deploy to staging first
docker-compose -f docker-compose.staging.yml up -d

# 4. Run production acceptance tests
npm run test:production

# 5. Deploy to production with zero downtime
./scripts/deploy-production.sh

# 6. Verify deployment
curl -f https://duration.finance/api/health
```

#### **Post-Deployment Verification**:
- [ ] All services responding correctly
- [ ] SSL certificate valid and properly configured
- [ ] Database connections secure and encrypted
- [ ] Monitoring dashboards showing green status
- [ ] Security scan completed without issues
- [ ] Performance baselines established
- [ ] Incident response team notified of go-live

---

## 8. Ongoing Security Maintenance

### 8.1 Regular Security Tasks

#### **Daily**:
- [ ] Review security logs and alerts
- [ ] Monitor system health dashboards
- [ ] Check for new security advisories

#### **Weekly**:
- [ ] Update dependencies with security patches
- [ ] Review access logs for anomalies
- [ ] Test backup and recovery procedures

#### **Monthly**:
- [ ] Conduct security assessment
- [ ] Review and rotate API keys
- [ ] Update incident response procedures
- [ ] Security training for team members

#### **Quarterly**:
- [ ] External penetration testing
- [ ] Smart contract audit review
- [ ] Disaster recovery drill
- [ ] Security policy review and updates

### 8.2 Continuous Improvement

#### **Security Metrics**:
- Mean time to detection (MTTD)
- Mean time to response (MTTR)
- Number of security incidents
- Vulnerability remediation time
- Security test coverage percentage

#### **Threat Modeling Updates**:
- Regular review of threat landscape
- Assessment of new attack vectors
- Update security controls accordingly
- Review and test incident response plans

---

## Conclusion

This security and deployment separation guide provides a comprehensive framework for secure deployment of Duration.Finance. Following these procedures ensures:

✅ **Multi-layered security architecture**  
✅ **Proper environment separation**  
✅ **Incident response preparedness**  
✅ **Continuous security monitoring**  
✅ **Scalable security practices**  

**Remember**: Security is not a one-time setup but an ongoing process that requires continuous attention, monitoring, and improvement.

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Next Review**: Quarterly  
**Approval**: Security Team Lead