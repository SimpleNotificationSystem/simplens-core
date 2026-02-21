/**
 * Integration Tests for Notification Templates Controller
 * Tests template creation, retrieval, and error handling
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { randomUUID } from "crypto";
import { MongoServerError } from "mongodb";

// Create a minimal express app for testing
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  // Mock auth middleware to always pass
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "API KEY missing" });
    }
    const apiKey = authHeader.split(" ")[1];
    if (apiKey !== "test-api-key") {
      return res.status(401).json({ message: "Invalid API KEY" });
    }
    next();
  });

  // Import controllers
  const { createTemplate, getTemplates, getTemplateById } =
    await import("../../../src/api/controllers/notification_templates.controller.js");

  app.post("/api/templates", createTemplate);
  app.get("/api/templates", getTemplates);
  app.get("/api/templates/:template_id", getTemplateById);

  return app;
};

// Mock dependencies
vi.mock("../../../src/database/models/notification-template.models.js", () => ({
  default: {
    insertOne: vi.fn(),
    find: vi.fn(),
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

// Mock PluginRegistry
vi.mock("../../../src/plugins/index.js", () => ({
  PluginRegistry: {
    getPluginMetadata: vi.fn().mockReturnValue({
      channels: {
        email: {
          providers: [
            {
              name: "gmail",
              id: "gmail-provider",
            },
            {
              name: "resend",
              id: "resend-provider",
            },
          ],
        },
        sms: {
          providers: [
            {
              name: "twilio",
              id: "twilio-provider",
            },
          ],
        },
      },
    }),
    get: vi.fn(),
  },
}));

describe("Notification Templates Controller", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/templates - createTemplate", () => {
    it("should create a template successfully", async () => {
      const { PluginRegistry } = await import("../../../src/plugins/index.js");
      (PluginRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        getContentSchema: vi.fn().mockReturnValue({
          safeParse: vi.fn().mockReturnValue({ success: true }),
        }),
      });

      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      (
        notification_template_model.insertOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        _id: "template-id-1",
        template_id: "email-template-1",
        name: "Welcome Email",
        package: "gmail",
      });

      const templateRequest = {
        template_id: "email-template-1",
        name: "Welcome Email",
        description: "Template for welcoming new users",
        package: "gmail",
        content: {
          subject: "Welcome to SimpleNS",
          message: "Hello {{name}}, welcome!",
        },
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .send(templateRequest);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Template created successfully");
      expect(notification_template_model.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          template_id: "email-template-1",
          name: "Welcome Email",
          package: "gmail",
        }),
      );
    });

    it("should return 400 for missing required fields", async () => {
      const invalidRequest = {
        template_id: "email-template-1",
        // Missing name, description, package, content
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toBeTruthy();
      expect(response.body.errors).toBeDefined();
    });

    it("should return 400 for non-existent package", async () => {
      const templateRequest = {
        template_id: "sms-template-1",
        name: "SMS Template",
        description: "SMS template",
        package: "non-existent-provider",
        content: {
          message: "Hello {{name}}",
        },
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .send(templateRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("does not exists");
    });

    it("should return 400 for invalid content schema", async () => {
      const { PluginRegistry } = await import("../../../src/plugins/index.js");

      // Mock getContentSchema to return validation failure
      (PluginRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        getContentSchema: vi.fn().mockReturnValue({
          safeParse: vi.fn().mockReturnValue({
            success: false,
            error: { message: "Invalid content schema" },
          }),
        }),
      });

      const templateRequest = {
        template_id: "email-template-2",
        name: "Invalid Template",
        description: "Template with invalid content",
        package: "gmail",
        content: {
          invalid_field: "This is not valid",
        },
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .send(templateRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Invalid content schema");
    });

    it("should return 400 for duplicate template_id (E11000 error)", async () => {
      const { PluginRegistry } = await import("../../../src/plugins/index.js");
      (PluginRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        getContentSchema: vi.fn().mockReturnValue({
          safeParse: vi.fn().mockReturnValue({ success: true }),
        }),
      });

      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      const duplicateError = new MongoServerError({message:"E11000 duplicate key error"});
      (duplicateError as any).code = 11000;

      (
        notification_template_model.insertOne as ReturnType<typeof vi.fn>
      ).mockRejectedValue(duplicateError);

      const templateRequest = {
        template_id: "email-template-1",
        name: "Welcome Email",
        description: "Duplicate template",
        package: "gmail",
        content: {
          subject: "Welcome",
          message: "Hello",
        },
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .send(templateRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Template-Id already exists");
    });

    it("should return 500 for unexpected errors", async () => {
      const { PluginRegistry } = await import("../../../src/plugins/index.js");
      (PluginRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue({
        getContentSchema: vi.fn().mockReturnValue({
          safeParse: vi.fn().mockReturnValue({ success: true }),
        }),
      });

      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      (
        notification_template_model.insertOne as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Database connection error"));

      const templateRequest = {
        template_id: "email-template-1",
        name: "Welcome Email",
        description: "Template",
        package: "gmail",
        content: {
          subject: "Welcome",
          message: "Hello",
        },
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .send(templateRequest);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Internal Server Error");
    });

    it("should return 401 for missing authorization", async () => {
      const templateRequest = {
        template_id: "email-template-1",
        name: "Welcome Email",
        package: "gmail",
        content: { subject: "Test", message: "Test" },
      };

      const response = await request(app)
        .post("/api/templates")
        .send(templateRequest);

      expect(response.status).toBe(401);
    });

    it("should return 401 for invalid authorization", async () => {
      const templateRequest = {
        template_id: "email-template-1",
        name: "Welcome Email",
        package: "gmail",
        content: { subject: "Test", message: "Test" },
      };

      const response = await request(app)
        .post("/api/templates")
        .set("Authorization", "Bearer invalid-key")
        .send(templateRequest);

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/templates - getTemplates", () => {
    it("should retrieve templates by package name", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      const { apiLogger } = await import("../../../src/workers/utils/logger.js");

      (
        notification_template_model.find as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          template_id: "email-template-1",
          name: "Welcome Email",
          description: "Welcome template",
          package: "gmail",
        },
        {
          template_id: "email-template-2",
          name: "Verification Email",
          description: "Email verification template",
          package: "gmail",
        },
      ]);

      const response = await request(app)
        .get("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .query({ package_name: "gmail" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toEqual(
        expect.objectContaining({
          template_id: "email-template-1",
          name: "Welcome Email",
        }),
      );
      expect(apiLogger.info).toHaveBeenCalledWith(
        "Found 2 templates for the given package: gmail",
      );
    });

    it("should return empty array when no templates found", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;
      const { apiLogger } = await import("../../../src/workers/utils/logger.js");

      (
        notification_template_model.find as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .query({ package_name: "non-existent-provider" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
      expect(apiLogger.info).toHaveBeenCalledWith(
        "No templates found for the given package name non-existent-provider",
      );
    });

    it("should return 400 when package_name is missing", async () => {
      const response = await request(app)
        .get("/api/templates")
        .set("Authorization", "Bearer test-api-key");

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Package name required");
    });

    it("should return 500 for unexpected errors", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      (
        notification_template_model.find as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/templates")
        .set("Authorization", "Bearer test-api-key")
        .query({ package_name: "gmail" });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Internal Server Error");
    });

    it("should return 401 for missing authorization", async () => {
      const response = await request(app)
        .get("/api/templates")
        .query({ package_name: "gmail" });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/templates/:template_id - getTemplateById", () => {
    it("should retrieve template by id", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        _id: "mongo-id-1",
        template_id: "email-template-1",
        name: "Welcome Email",
        description: "Welcome template",
        package: "gmail",
        content: {
          subject: "Welcome to SimpleNS",
          message: "Hello {{name}}, welcome!",
        },
      });

      const response = await request(app)
        .get("/api/templates/email-template-1")
        .set("Authorization", "Bearer test-api-key");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          template_id: "email-template-1",
          name: "Welcome Email",
          package: "gmail",
        }),
      );
      expect(response.body.content).toBeDefined();
    });

    it("should return 404 with message when template not found", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const response = await request(app)
        .get("/api/templates/non-existent-id")
        .set("Authorization", "Bearer test-api-key");

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("No template found for the given id");
    });

    it("should return 400 when template_id is missing", async () => {
      const response = await request(app)
        .get("/api/templates/%20")
        .set("Authorization", "Bearer test-api-key");

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Template-Id required");
    });

    it("should return 500 for unexpected errors", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/templates/email-template-1")
        .set("Authorization", "Bearer test-api-key");

      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Internal Server Error");
    });

    it("should return 401 for missing authorization", async () => {
      const response = await request(app)
        .get("/api/templates/email-template-1");

      expect(response.status).toBe(401);
    });

    it("should include all template fields in response", async () => {
      const notification_template_model = (
        await import("../../../src/database/models/notification-template.models.js")
      ).default;

      const templateData = {
        _id: "mongo-id-1",
        template_id: "sms-template-1",
        name: "OTP SMS",
        description: "SMS template for OTP",
        package: "twilio",
        content: {
          message: "Your OTP is {{otp}}",
        },
      };

      (
        notification_template_model.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue(templateData);

      const response = await request(app)
        .get("/api/templates/sms-template-1")
        .set("Authorization", "Bearer test-api-key");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          name: "OTP SMS",
          description: "SMS template for OTP",
          template_id: "sms-template-1",
          package: "twilio",
          content: templateData.content,
        }),
      );
    });
  });
});
