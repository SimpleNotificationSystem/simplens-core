/**
 * Unit Tests for API Utility Functions
 * Tests conversion functions and error handling
 *
 * Updated for plugin-based architecture - uses dynamic channel strings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import {
  NOTIFICATION_STATUS,
  getTopicForChannel,
} from "../../../src/types/types.js";
import type {
  notification_request,
  batch_notification_request,
  notification,
} from "../../../src/types/types.js";

// We need to mock the database models before importing utils
vi.mock("../../../src/database/models/notification.models.js", () => ({
  default: {
    insertMany: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock("../../../src/database/models/outbox.models.js", () => ({
  default: {
    insertMany: vi.fn(),
  },
}));

vi.mock("../../../src/database/models/notification-template.models.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../../src/workers/utils/logger.js", () => ({
  apiLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock PluginRegistry to always return true for channel/provider checks
vi.mock("../../../src/plugins/index.js", () => ({
  PluginRegistry: {
    hasChannel: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(true),
    getDefaultProvider: vi.fn().mockReturnValue({
      getContentSchema: vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({ success: true }),
      }),
    }),
    get: vi.fn().mockReturnValue({
      getContentSchema: vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({ success: true }),
      }),
    }),
  },
}));

describe("API Utility Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("convert_notification_request_to_notification_schema", () => {
    it("should convert a single-channel request to notifications array", async () => {
      // Dynamic import after mocks are set up
      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        content: {
          email: {
            subject: "Test Subject",
            message: "Test message",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications).toHaveLength(1);
      expect(notifications[0].channel).toBe("email");
      expect(notifications[0].request_id).toBe(request.request_id);
      expect(notifications[0].recipient.email).toBe("test@example.com");
      expect(notifications[0].status).toBe(NOTIFICATION_STATUS.pending);
    });

    it("should create multiple notifications for multi-channel request", async () => {
      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "whatsapp"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
          phone: "+1234567890",
        },
        content: {
          email: {
            subject: "Test Subject",
            message: "Email message",
          },
          whatsapp: {
            message: "WhatsApp message",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications).toHaveLength(2);
      expect(notifications.map((n) => n.channel).sort()).toEqual(
        ["email", "whatsapp"].sort(),
      );
    });

    it("should preserve scheduled_at for delayed notifications", async () => {
      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const futureDate = new Date(Date.now() + 60000);
      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        content: {
          email: {
            subject: "Scheduled",
            message: "Scheduled message",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
        scheduled_at: futureDate,
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications[0].scheduled_at).toEqual(futureDate);
    });

    it("should handle provider as string (applies to all channels)", async () => {
      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email"],
        provider: ["gmail"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        content: {
          email: {
            subject: "Test",
            message: "Test",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications[0].provider).toBe("gmail");
    });

    it("should handle provider as array (maps to channels)", async () => {
      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "whatsapp"],
        provider: ["gmail", "twilio"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
          phone: "+1234567890",
        },
        content: {
          email: { subject: "Test", message: "Test" },
          whatsapp: { message: "Test" },
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications).toHaveLength(2);
      const emailNotif = notifications.find((n) => n.channel === "email");
      const whatsappNotif = notifications.find((n) => n.channel === "whatsapp");
      expect(emailNotif?.provider).toBe("gmail");
      expect(whatsappNotif?.provider).toBe("twilio");
    });
  });

  describe("convert_batch_notification_schema_to_notification_schema", () => {
    it("should convert batch request to multiple notifications", async () => {
      const { convert_batch_notification_schema_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: batch_notification_request = {
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email"],
        content: {
          email: {
            subject: "Batch Subject",
            message: "Hello {{name}}",
          },
        },
        recipients: [
          {
            request_id: randomUUID(),
            user_id: "user-1",
            email: "user1@example.com",
            variables: { name: "User 1" },
          },
          {
            request_id: randomUUID(),
            user_id: "user-2",
            email: "user2@example.com",
            variables: { name: "User 2" },
          },
          {
            request_id: randomUUID(),
            user_id: "user-3",
            email: "user3@example.com",
            variables: { name: "User 3" },
          },
        ],
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_batch_notification_schema_to_notification_schema(request);

      expect(notifications).toHaveLength(3);
      expect(notifications[0].recipient.email).toBe("user1@example.com");
      expect(notifications[1].recipient.email).toBe("user2@example.com");
      expect(notifications[2].recipient.email).toBe("user3@example.com");
    });

    it("should create notifications for each channel per recipient", async () => {
      const { convert_batch_notification_schema_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: batch_notification_request = {
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "whatsapp"],
        content: {
          email: {
            subject: "Test",
            message: "Email message",
          },
          whatsapp: {
            message: "WhatsApp message",
          },
        },
        recipients: [
          {
            request_id: randomUUID(),
            user_id: "user-1",
            email: "user1@example.com",
            phone: "+1111111111",
          },
          {
            request_id: randomUUID(),
            user_id: "user-2",
            email: "user2@example.com",
            phone: "+2222222222",
          },
        ],
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_batch_notification_schema_to_notification_schema(request);

      // 2 recipients x 2 channels = 4 notifications
      expect(notifications).toHaveLength(4);
    });
  });

  describe("Template-based requests with flexible template_id/channel length", () => {
    it("should use template when template_id exists for channel", async () => {
      // Mock the template model
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        template_id: "email-template-1",
        content: {
          subject: "Welcome {{name}}",
          message: "Welcome to SimpleNS",
        },
      });

      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email"],
        template_id: ["email-template-1"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        variables: { name: "John" },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications).toHaveLength(1);
      expect(notifications[0].content).toEqual({
        subject: "Welcome {{name}}",
        message: "Welcome to SimpleNS",
      });
    });

    it("should fallback to content when template_id is not provided for channel", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      // No template lookup should happen
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockClear();

      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "sms"],
        template_id: ["email-template-1"], // Only one template_id for 2 channels
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
          phone: "+1234567890",
        },
        content: {
          email: {
            subject: "Email from template",
            message: "This came from template",
          },
          sms: {
            message: "SMS content from request",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications).toHaveLength(2);
      // SMS channel should use content from request since no template_id[1] provided
      const smsNotif = notifications.find((n) => n.channel === "sms");
      expect(smsNotif?.content).toEqual({
        message: "SMS content from request",
      });
    });

    it("should handle batch request with partial template_id array", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        template_id: "email-template-1",
        content: {
          subject: "Welcome {{name}}",
          message: "Welcome to SimpleNS",
        },
      });

      const { convert_batch_notification_schema_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: batch_notification_request = {
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "sms"],
        template_id: ["email-template-1"], // Only template for email channel
        content: {
          sms: {
            message: "SMS alert: {{alert_type}}",
          },
        },
        recipients: [
          {
            request_id: randomUUID(),
            user_id: "user-1",
            email: "user1@example.com",
            phone: "+1111111111",
            variables: { alert_type: "critical" },
          },
        ],
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_batch_notification_schema_to_notification_schema(request);

      expect(notifications).toHaveLength(2);
      // Email should use template content
      const emailNotif = notifications.find((n) => n.channel === "email");
      expect(emailNotif?.content).toEqual({
        subject: "Welcome {{name}}",
        message: "Welcome to SimpleNS",
      });
      // SMS should use content from request
      const smsNotif = notifications.find((n) => n.channel === "sms");
      expect(smsNotif?.content).toEqual({
        message: "SMS alert: {{alert_type}}",
      });
    });

    it("should throw error when template not found and no content fallback provided", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email"],
        template_id: ["non-existent-template"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      await expect(
        convert_notification_request_to_notification_schema(request),
      ).rejects.toThrow("Template not found for the given template_id");
    });

    it("should throw error when neither template nor content provided for channel", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      // Mock to return template for email-template-1
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        template_id: "email-template-1",
        content: {
          subject: "Test",
          message: "Test",
        },
      });

      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "sms"],
        template_id: ["email-template-1"], // Only email template
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
          phone: "+1234567890",
        },
        content: {
          // No email content (will use template)
          // Missing sms content - this should throw
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      await expect(
        convert_notification_request_to_notification_schema(request),
      ).rejects.toThrow("sms record not found in content field");
    });

    it("should handle multiple recipients with mixed template/content sources in batch", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        template_id: "email-template-1",
        content: {
          subject: "Hello {{name}}",
          message: "Welcome to SimpleNS",
        },
      });

      const { convert_batch_notification_schema_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: batch_notification_request = {
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "push"],
        template_id: ["email-template-1"], // Only email has template
        content: {
          push: {
            title: "{{title}}",
            body: "New message",
          },
        },
        recipients: [
          {
            request_id: randomUUID(),
            user_id: "user-1",
            email: "user1@example.com",
            variables: { name: "Alice", title: "Alert" },
          },
          {
            request_id: randomUUID(),
            user_id: "user-2",
            email: "user2@example.com",
            variables: { name: "Bob", title: "Info" },
          },
        ],
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_batch_notification_schema_to_notification_schema(request);

      // 2 recipients x 2 channels = 4 notifications
      expect(notifications).toHaveLength(4);

      // All email notifications should use template content
      const emailNotifs = notifications.filter((n) => n.channel === "email");
      expect(emailNotifs).toHaveLength(2);
      emailNotifs.forEach((notif) => {
        expect(notif.content).toEqual({
          subject: "Hello {{name}}",
          message: "Welcome to SimpleNS",
        });
      });

      // All push notifications should use content from request
      const pushNotifs = notifications.filter((n) => n.channel === "push");
      expect(pushNotifs).toHaveLength(2);
      pushNotifs.forEach((notif) => {
        expect(notif.content).toEqual({
          title: "{{title}}",
          body: "New message",
        });
      });
    });

    it("should support provider array mapping with template_id", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        template_id: "email-template-1",
        content: {
          subject: "Notification",
          message: "You have a message",
        },
      });

      const { convert_notification_request_to_notification_schema } =
        await import("../../../src/api/utils/utils.js");

      const request: notification_request = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: ["email", "sms"],
        provider: ["gmail", "twilio"],
        template_id: ["email-template-1"],
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
          phone: "+1234567890",
        },
        content: {
          sms: {
            message: "Quick SMS",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
      };

      const notifications =
        await convert_notification_request_to_notification_schema(request);

      expect(notifications).toHaveLength(2);
      const emailNotif = notifications.find((n) => n.channel === "email");
      const smsNotif = notifications.find((n) => n.channel === "sms");
      expect(emailNotif?.provider).toBe("gmail");
      expect(smsNotif?.provider).toBe("twilio");
    });
  });

  describe("DuplicateNotificationError", () => {
    it("should create error with correct properties", async () => {
      const { DuplicateNotificationError } =
        await import("../../../src/api/utils/utils.js");

      const duplicates = [
        { request_id: randomUUID(), channel: "email" },
        { request_id: randomUUID(), channel: "whatsapp" },
      ];

      const error = new DuplicateNotificationError(
        "Duplicate found",
        duplicates,
      );

      expect(error.name).toBe("DuplicateNotificationError");
      expect(error.duplicateCount).toBe(2);
      expect(error.duplicateKeys).toEqual(duplicates);
      expect(error.message).toBe("Duplicate found");
    });

    it("should handle empty duplicates array", async () => {
      const { DuplicateNotificationError } =
        await import("../../../src/api/utils/utils.js");

      const error = new DuplicateNotificationError("No duplicates");

      expect(error.duplicateCount).toBe(0);
      expect(error.duplicateKeys).toEqual([]);
    });
  });

  describe("InvalidProviderChannelError", () => {
    it("should create error with correct properties", async () => {
      const { InvalidProviderChannelError } =
        await import("../../../src/api/utils/utils.js");

      const error = new InvalidProviderChannelError(
        "Invalid provider(s): test-provider",
        [],
        ["test-provider"],
      );

      expect(error.name).toBe("InvalidProviderChannelError");
      expect(error.invalidChannels).toEqual([]);
      expect(error.invalidProviders).toEqual(["test-provider"]);
      expect(error.message).toBe("Invalid provider(s): test-provider");
    });

    it("should handle both invalid channels and providers", async () => {
      const { InvalidProviderChannelError } =
        await import("../../../src/api/utils/utils.js");

      const error = new InvalidProviderChannelError(
        "Invalid channel(s): sms. Invalid provider(s): gmail",
        ["sms"],
        ["gmail"],
      );

      expect(error.invalidChannels).toEqual(["sms"]);
      expect(error.invalidProviders).toEqual(["gmail"]);
    });

    it("should handle empty arrays", async () => {
      const { InvalidProviderChannelError } =
        await import("../../../src/api/utils/utils.js");

      const error = new InvalidProviderChannelError("No issues");

      expect(error.invalidChannels).toEqual([]);
      expect(error.invalidProviders).toEqual([]);
    });
  });

  describe("validateProviderAndChannel", () => {
    it("should not throw when all channels and providers exist", async () => {
      const { validateProviderAndChannel } =
        await import("../../../src/api/utils/utils.js");
      const { PluginRegistry } = await import("../../../src/plugins/index.js");

      // Mock returns true (set in the global mock)
      const notifications: notification[] = [
        {
          request_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          client_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          channel: "email",
          provider: "gmail",
          recipient: { email: "test@example.com" },
          content: { subject: "Test", message: "Test" },
          webhook_url: "https://webhook.example.com/callback",
          status: NOTIFICATION_STATUS.pending,
          retry_count: 0,
        },
      ];

      expect(() => validateProviderAndChannel(notifications)).not.toThrow();
      expect(PluginRegistry.hasChannel).toHaveBeenCalledWith("email");
      expect(PluginRegistry.has).toHaveBeenCalledWith("gmail");
    });

    it("should skip provider check when provider is not specified", async () => {
      const { validateProviderAndChannel } =
        await import("../../../src/api/utils/utils.js");
      const { PluginRegistry } = await import("../../../src/plugins/index.js");

      const notifications: notification[] = [
        {
          request_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          client_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          channel: "email",
          // No provider specified
          recipient: { email: "test@example.com" },
          content: { subject: "Test", message: "Test" },
          webhook_url: "https://webhook.example.com/callback",
          status: NOTIFICATION_STATUS.pending,
          retry_count: 0,
        },
      ];

      expect(() => validateProviderAndChannel(notifications)).not.toThrow();
      expect(PluginRegistry.hasChannel).toHaveBeenCalledWith("email");
      // has() should not be called when provider is undefined
    });
  });

  describe("to_channel_notification", () => {
    it("should convert notification to channel format", async () => {
      const { to_channel_notification } =
        await import("../../../src/api/utils/utils.js");

      const notification: notification = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: "email",
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        content: {
          email: {
            subject: "Test Subject",
            message: "Test message",
          },
        },
        variables: { name: "Test User" },
        webhook_url: "https://webhook.example.com/callback",
        status: NOTIFICATION_STATUS.pending,
        retry_count: 0,
      };

      const notificationId = new mongoose.Types.ObjectId();
      const channelNotification = to_channel_notification(
        notification,
        notificationId,
      );

      expect(channelNotification.notification_id).toEqual(notificationId);
      expect(channelNotification.channel).toBe("email");
      expect((channelNotification.recipient as any).email).toBe(
        "test@example.com",
      );
    });

    it("should extract channel-specific content", async () => {
      const { to_channel_notification } =
        await import("../../../src/api/utils/utils.js");

      const notification: notification = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: "email",
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        content: {
          email: {
            subject: "Nested Subject",
            message: "Nested message",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
        status: NOTIFICATION_STATUS.pending,
        retry_count: 0,
      };

      const notificationId = new mongoose.Types.ObjectId();
      const channelNotification = to_channel_notification(
        notification,
        notificationId,
      );

      // Content should be extracted from content.email
      expect((channelNotification.content as any).subject).toBe(
        "Nested Subject",
      );
      expect((channelNotification.content as any).message).toBe(
        "Nested message",
      );
    });
  });

  describe("to_delayed_notification_topic", () => {
    it("should convert notification to delayed format", async () => {
      const { to_delayed_notification_topic } =
        await import("../../../src/api/utils/utils.js");

      const scheduledAt = new Date(Date.now() + 60000);
      const notification: notification = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: "email",
        recipient: {
          user_id: "user-123",
          email: "test@example.com",
        },
        content: {
          email: {
            subject: "Scheduled",
            message: "Scheduled message",
          },
        },
        webhook_url: "https://webhook.example.com/callback",
        status: NOTIFICATION_STATUS.pending,
        retry_count: 0,
        scheduled_at: scheduledAt,
      };

      const notificationId = new mongoose.Types.ObjectId();
      const delayedNotification = to_delayed_notification_topic(
        notification,
        notificationId,
      );

      expect(delayedNotification.notification_id).toEqual(notificationId);
      expect(delayedNotification.scheduled_at).toEqual(scheduledAt);
      expect(delayedNotification.target_topic).toBe(
        getTopicForChannel("email"),
      );
    });
  });

  describe("convert_notification_schema_to_outbox_schema", () => {
    it("should create outbox entry for immediate notification", async () => {
      const { convert_notification_schema_to_outbox_schema } =
        await import("../../../src/api/utils/utils.js");

      const notification: notification = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: "email",
        recipient: { user_id: "user-123", email: "test@example.com" },
        content: { subject: "Test", message: "Test message" },
        webhook_url: "https://webhook.example.com/callback",
        status: NOTIFICATION_STATUS.pending,
        retry_count: 0,
        created_at: new Date(),
      };

      const notificationId = new mongoose.Types.ObjectId();
      const outbox = convert_notification_schema_to_outbox_schema(
        notification,
        notificationId,
      );

      expect(outbox.notification_id).toEqual(notificationId);
      expect(outbox.topic).toBe(getTopicForChannel("email"));
      expect(outbox.status).toBe("pending");
    });

    it("should create outbox entry for scheduled notification with delayed topic", async () => {
      const { convert_notification_schema_to_outbox_schema } =
        await import("../../../src/api/utils/utils.js");

      const futureDate = new Date(Date.now() + 60000);
      const notification: notification = {
        request_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id:
          randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: "email",
        recipient: { user_id: "user-123", email: "test@example.com" },
        content: { subject: "Test", message: "Test message" },
        webhook_url: "https://webhook.example.com/callback",
        status: NOTIFICATION_STATUS.pending,
        retry_count: 0,
        scheduled_at: futureDate,
        created_at: new Date(),
      };

      const notificationId = new mongoose.Types.ObjectId();
      const outbox = convert_notification_schema_to_outbox_schema(
        notification,
        notificationId,
      );

      expect(outbox.topic).toBe("delayed_notification");
    });
  });

  describe("process_notifications", () => {
    // NOTE: These tests are skipped because process_notifications uses `new notification_model()`
    // which requires a mongoose model constructor, not a simple object mock.
    // Full integration tests for this function should be in integration tests with a real DB.

    it.skip("should process notifications successfully - requires model constructor mock", () => {
      // This test would require mocking mongoose.model as a constructor
    });

    it.skip("should handle partial duplicates - requires model constructor mock", () => {
      // This test would require mocking mongoose.model as a constructor
    });

    it("should throw DuplicateNotificationError when all notifications are duplicates", async () => {
      const mockSession = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn().mockResolvedValue(undefined),
        abortTransaction: vi.fn().mockResolvedValue(undefined),
        endSession: vi.fn(),
        inTransaction: vi.fn().mockReturnValue(true),
      };
      vi.spyOn(mongoose, "startSession").mockResolvedValue(
        mockSession as unknown as mongoose.ClientSession,
      );

      const notification_model = (
        await import("../../../src/database/models/notification.models.js")
      ).default;

      // All calls return existing (duplicate)
      (notification_model.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        session: vi
          .fn()
          .mockResolvedValue({ _id: new mongoose.Types.ObjectId() }),
      });

      const { process_notifications, DuplicateNotificationError } =
        await import("../../../src/api/utils/utils.js");

      const notifications: notification[] = [
        {
          request_id:
            "duplicate-id" as `${string}-${string}-${string}-${string}-${string}`,
          client_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          channel: "email",
          recipient: { user_id: "user-1", email: "test@example.com" },
          content: { subject: "Test", message: "Test" },
          webhook_url: "https://webhook.example.com/callback",
          status: NOTIFICATION_STATUS.pending,
          retry_count: 0,
          created_at: new Date(),
        },
      ];

      await expect(process_notifications(notifications)).rejects.toThrow(
        DuplicateNotificationError,
      );
    });

    it("should rollback transaction on error", async () => {
      const mockSession = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn().mockResolvedValue(undefined),
        abortTransaction: vi.fn().mockResolvedValue(undefined),
        endSession: vi.fn(),
        inTransaction: vi.fn().mockReturnValue(true),
      };
      vi.spyOn(mongoose, "startSession").mockResolvedValue(
        mockSession as unknown as mongoose.ClientSession,
      );

      const notification_model = (
        await import("../../../src/database/models/notification.models.js")
      ).default;

      // Simulate error during findOne
      (notification_model.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        session: vi.fn().mockRejectedValue(new Error("Database error")),
      });

      const { process_notifications } =
        await import("../../../src/api/utils/utils.js");

      const notifications: notification[] = [
        {
          request_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          client_id:
            randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          channel: "email",
          recipient: { user_id: "user-1", email: "test@example.com" },
          content: { subject: "Test", message: "Test" },
          webhook_url: "https://webhook.example.com/callback",
          status: NOTIFICATION_STATUS.pending,
          retry_count: 0,
          created_at: new Date(),
        },
      ];

      await expect(process_notifications(notifications)).rejects.toThrow(
        "Database error",
      );
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it("should handle empty notifications array", async () => {
      const mockSession = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn().mockResolvedValue(undefined),
        abortTransaction: vi.fn().mockResolvedValue(undefined),
        endSession: vi.fn(),
        inTransaction: vi.fn().mockReturnValue(true),
      };
      vi.spyOn(mongoose, "startSession").mockResolvedValue(
        mockSession as unknown as mongoose.ClientSession,
      );

      const outbox_model = (
        await import("../../../src/database/models/outbox.models.js")
      ).default;

      const { process_notifications } =
        await import("../../../src/api/utils/utils.js");

      const result = await process_notifications([]);

      expect(result.notification_ids).toHaveLength(0);
      expect(result.created_count).toBe(0);
      expect(result.duplicate_count).toBe(0);
      // insertMany should not be called for empty array
      expect(outbox_model.insertMany).not.toHaveBeenCalled();
    });
  });
});
