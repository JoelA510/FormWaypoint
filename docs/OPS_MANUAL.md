# API Procurement Guide

This guide outlines the steps to obtain the necessary API credentials for the Shipping Document Generator application.

## 1. FedEx API

**Purpose**: Rate shopping, label generation, pickup scheduling, and AES filing.

**Portal**: [FedEx Developer Portal](https://developer.fedex.com/)

### Steps to Obtain Credentials:
1.  **Register**: Create an account on the FedEx Developer Portal.
2.  **Create a Project**:
    *   Navigate to "My Projects" -> "Create a Project".
    *   Select "Shipping" and "Rates & Transit Times" as capabilities.
    *   For AES Filing, ensure "International Shipping" features are enabled.
3.  **Get Credentials**:
    *   You will receive a **Client ID** (API Key) and **Client Secret**.
    *   You will also need your **FedEx Account Number**.
4.  **Environment**:
    *   Start with **Sandbox** credentials for testing.
    *   When ready, apply for **Production** keys (may require certification testing).

**Required Fields for App**:
*   `Client ID`
*   `Client Secret`
*   `Account Number`

---

## 2. UPS API

**Purpose**: Rate shopping, label generation, and pickup scheduling.

**Portal**: [UPS Developer Portal](https://developer.ups.com/)

### Steps to Obtain Credentials:
1.  **Register**: Log in to your UPS.com account.
2.  **Create an App**:
    *   Go to "My Apps" -> "Add Apps".
    *   Select "I want to integrate UPS technology into my business".
    *   Select the following products: **Authorization (OAuth)**, **Rating**, **Shipping**, **Pickup**.
3.  **Get Credentials**:
    *   You will receive a **Client ID** and **Client Secret**.
    *   You will need your **UPS Account Number** (6 alphanumeric characters).
4.  **Environment**:
    *   UPS provides a testing environment. Ensure your app is set to use the correct URLs (the app defaults to testing URLs until configured otherwise).

**Required Fields for App**:
*   `Client ID`
*   `Client Secret`
*   `Account Number`

---

## 3. Email (SMTP)

**Purpose**: Sending notifications for comments, assignments, and document completion.

**Provider**: Any SMTP provider (Gmail, SendGrid, AWS SES, Outlook).

### Example: Gmail (App Password)
1.  Go to your Google Account settings -> Security.
2.  Enable 2-Step Verification.
3.  Search for "App Passwords".
4.  Create a new app password for "Mail".
5.  Use this password instead of your login password.

**Required Fields for App**:
*   `SMTP_HOST` (e.g., `smtp.gmail.com`)
*   `SMTP_PORT` (e.g., `587`)
*   `SMTP_USER` (Your email)
*   `SMTP_PASS` (App Password)

---

## 4. USPS (Optional / Future)

**Note**: The current implementation focuses on FedEx and UPS. If you wish to add USPS:

**Portal**: [USPS Web Tools](https://www.usps.com/business/web-tools-apis.htm)

*   **Registration**: Sign up to receive a User ID.
*   **Capabilities**: Free APIs are mostly for tracking and address validation.
*   **Postage**: For generating labels (postage), you typically need a PC Postage provider account (like Pitney Bowes, Endicia, or EasyPost) as direct USPS postage APIs have strict certification requirements.

---

## Summary of Environment Variables

Add these to your `.env` file or configure via the UI:

```bash
# FedEx
FEDEX_CLIENT_ID=your_client_id
FEDEX_CLIENT_SECRET=your_client_secret
FEDEX_ACCOUNT_NUMBER=your_account_number

# UPS
UPS_CLIENT_ID=your_client_id
UPS_CLIENT_SECRET=your_client_secret
UPS_ACCOUNT_NUMBER=your_account_number

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=your_app_password
```
