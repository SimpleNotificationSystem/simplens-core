# simplens-sdk

SDK for building SimpleNS notification provider plugins.

## Installation

```bash
npm install simplens-sdk
```

## Usage

```typescript
import { 
  SimpleNSProvider, 
  ProviderManifest, 
  DeliveryResult,
  createNotificationSchema,
  emailRecipientSchema,
  emailContentSchema,
  replaceVariables,
  z
} from 'simplens-sdk';

// Define your notification type
const notificationSchema = createNotificationSchema(
  'email',
  emailRecipientSchema,
  emailContentSchema
);

type MyNotification = z.infer<typeof notificationSchema>;

// Implement the provider
class MyEmailProvider implements SimpleNSProvider<MyNotification> {
  readonly manifest: ProviderManifest = {
    name: 'simplens-my-email',
    version: '1.0.0',
    channel: 'email',
    displayName: 'My Email Provider',
    description: 'Send emails via My Service',
    author: 'Your Name',
    requiredCredentials: ['API_KEY'],
  };
  
  getNotificationSchema() { return notificationSchema; }
  getRecipientSchema() { return emailRecipientSchema; }
  getContentSchema() { return emailContentSchema; }
  
  getRateLimitConfig() {
    return { maxTokens: 100, refillRate: 10 };
  }
  
  async initialize(config) {
    // Initialize your SDK/client
  }
  
  async healthCheck() {
    return true;
  }
  
  async send(notification): Promise<DeliveryResult> {
    let html = notification.content.html || '';
    
    // Use SDK utilities
    if (notification.variables) {
      html = replaceVariables(html, notification.variables);
    }
    
    // Send via your provider...
    return { success: true, messageId: 'msg-123' };
  }
  
  async shutdown() {
    // Cleanup
  }
}

export default MyEmailProvider;
```

## API Reference

### Interfaces

- `SimpleNSProvider<T>` - Main interface all providers implement
- `ProviderManifest` - Provider metadata
- `ProviderConfig` - Configuration passed during init
- `DeliveryResult` - Return type from send()
- `RateLimitConfig` - Rate limiting settings

### Schemas

- `baseNotificationSchema` - Common fields
- `emailRecipientSchema` - Email recipient
- `smsRecipientSchema` - SMS recipient
- `emailContentSchema` - Email content
- `createNotificationSchema()` - Build complete schema

### Utilities

- `replaceVariables(template, vars)` - Template substitution
- `isHtmlContent(str)` - Check for HTML
- `truncate(str, len)` - Truncate string
- `sleep(ms)` - Async delay
- `retryWithBackoff(fn)` - Retry helper
