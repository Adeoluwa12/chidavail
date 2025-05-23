# Availity Healthcare Portal Automation System

This system automates the login process for Availity, handles two-factor authentication with backup codes, navigates to the Care Center, and monitors for new member referrals.

## Features

- Automated login to Availity healthcare portal
- Two-factor authentication using backup codes
- Automatic extraction and storage of new backup codes
- Periodic checking for new referrals (every 30 seconds)
- Email notifications for new referrals using SendGrid
- SMS alerts for new referrals using Twilio
- 
## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Email service (for sending notifications)
- Twilio account (for sending SMS alerts)

## Installation

1. Clone the repository:

