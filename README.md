# Backend Notification Service

Lightweight, provider-agnostic backend notification service for sending EMAIL and WHATSAPP messages. It supports single and batch notifications, scheduled deliveries and webhook callbacks for final delivery status.

![Notification Service HLD](./assets/NotificationServiceHLD.png)

---

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & HLD](#architecture--hld)
- [API Endpoints](#api-endpoints)

---

## Overview
This service provides a REST HTTP API for accepting notifications (EMAIL and WHATSAPP) and delivers them asynchronously using pluggable providers. It supports both single notifications and batches, scheduled sends, and webhook callbacks for final delivery results.

This repository contains:
- `docs/api_docs.md` — detailed API documentation and examples
- `design/HLD/NotificationServiceHLD.excalidraw` — High-Level Design diagram (Excalidraw source)

---

## Key Features
- Accept single or batch notifications
- Support for EMAIL and WHATSAPP channels
- Scheduled notifications
- Webhook callbacks for per-notification delivery status
- Asynchronous processing with retry and idempotency support

---

## Architecture & HLD
See the HLD diagram above for a high-level view of components such as API gateway, queue/service bus, workers, and provider connectors.

---

## API Endpoints
Refer to the full API documentation in `docs/api_docs.md` for request/response examples, validation rules and webhook payloads.

Short overview:
- POST `/notification` — Send an individual notification
- POST `/notification/batch` — Send multiple notifications as a single request
- Webhook POST — Delivery callback to the `webhook_url` provided in the requests
---
