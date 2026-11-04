# 🏋️ IronPulse — Smart Gym & Fitness Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-REST_API-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL 8](https://img.shields.io/badge/MySQL-8.0_InnoDB-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Frontend](https://img.shields.io/badge/Frontend-Vanilla_HTML5_/_CSS3_/_ES6-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/)
[![Security](https://img.shields.io/badge/Security-Bcrypt_Hashing-F7DF1E?logo=javascript&logoColor=black)](https://github.com/kelektiv/node.bcrypt.js)
[![Mailer](https://img.shields.io/badge/Mailer-Nodemailer_SMTP-0EA5E9?logo=gmail&logoColor=white)](https://nodemailer.com/)

**IronPulse** is an enterprise-grade, multi-role Smart Gym & Fitness Management System built with a decoupled **Client-Server RESTful Architecture**. It streamlines daily athletic operations, membership revenue ledgers, coach-client scheduling, biometric progression tracking, turnstile access logs, and automated credential recovery.

---

## ✨ Key System Highlights

* **3 Dedicated Role-Based Portals**:
  * 👑 **Admin Portal**: Executive Command Center, membership dues lifecycle, financial ledger, plan configuration, coach capacity management, and turnstile access logs.
  * 🥊 **Trainer Portal**: Assigned client roster, client biometric tracking, routine prescription logger, and slot cancellation engine.
  * 🏃 **Member Portal**: Days-remaining countdown, assigned slot and locker details, biometrics card, and payment receipts.
* **⚡ Active Database Automation (MySQL Triggers)**:
  * `trg_calculate_bmi_insert` & `trg_calculate_bmi_update`: Automatically calculates and updates Body Mass Index ($BMI = kg / m^2$) at the database engine level.
  * `trg_check_membership_expiry` & `trg_check_membership_expiry_insert`: Automatically transitions members to `Inactive` if their plan end date passes current date.
* **🛡️ Security & Role Isolation**:
  * Passwords hashed using **Bcrypt.js** (10 salt rounds).
  * Data abstraction via **`Trainer_Assigned_View`** ensuring trainers cannot access gym financial ledgers or unassigned member records.
* **📬 Automated Credential Recovery**:
  * Live password reset dispatched directly via **Gmail SMTP (Nodemailer)**.
  * Uses RFC-standard **Content-ID (CID) inline attachments** so official branding renders seamlessly without remote image blocking in Gmail/Outlook.
* **⚡ Ultra-Fast Pure Web Frontend**:
  * Pure lightweight HTML5, modern CSS3, and ES6 fetch architecture delivering **sub-50ms page transitions** with zero build tool bloat.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────┐
│      Frontend Layer (Vanilla HTML5 / CSS3 / ES6)       │
│  ├─ Multi-Role Login Hub (/index.html)                 │
│  ├─ Admin Portal (/admin/)                             │
│  ├─ Trainer Portal (/trainer/)                         │
│  └─ Member Portal (/member/)                           │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP REST (JSON / Fetch API)
                           ▼
┌────────────────────────────────────────────────────────┐
│         Backend Layer (Node.js & Express.js)           │
│  ├─ REST API Routes (/api/members, /api/trainers, etc.)│
│  ├─ Connection Pool (mysql2/promise)                   │
│  ├─ Authentication & Bcrypt Hashing                    │
│  └─ Mail Service (Nodemailer + Gmail SMTP)             │
└──────────────────────────┬─────────────────────────────┘
                           │ MySQL Protocol (Port 3306)
                           ▼
┌────────────────────────────────────────────────────────┐
│          Database Layer (MySQL 8 Relational)           │
│  ├─ 10 Normalized Tables (3NF Schema)                  │
│  ├─ Active Triggers (Auto-BMI & Auto-Expiry)           │
│  └─ Security Views (Trainer_Assigned_View)             │
└────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema & Data Dictionary

The relational database (`smart_gym_db`) contains **10 tables normalized up to 3NF**:

| Table | Description |
| :--- | :--- |
| **`Membership_Plans`** | Tier pricing (Silver, Gold, Platinum) and duration in months. |
| **`Members`** | Member identity, unique email, contact, assigned plan FK, and active status. |
| **`Trainers`** | Certified coaches, specialization (Powerlifting, HIIT, Yoga), and contact email. |
| **`Admins`** | Privileged gym administrators with full superuser permissions. |
| **`Slot_Bookings`** | **M:N Junction Table** linking members and trainers to hourly time slots and lockers. |
| **`Payments`** | Financial ledger recording amount, timestamp, and method (UPI, Card, Cash). |
| **`Member_Biometrics`** | **1:1 Health metrics** (Height, Weight, auto-computed BMI, Body Fat %, target goal). |
| **`Client_Workouts`** | Prescribed workout sets, muscle group, sets, reps, and weight (kg). |
| **`Member_Access_Logs`** | Turnstile check-in/check-out security audit trail with IP address and duration. |
| **`System_Notifications`** | Role-targeted in-app notification center (admin/trainer/member/all). |

---

## 🚀 Quick Setup & Installation

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18.x or higher)
* [MySQL Server](https://www.mysql.com/) (v8.x running on port 3306)
* Git

### 2. Clone the Repository
```bash
git clone https://github.com/Sourav-Yadav-29/smart-gym-tracker.git
cd smart-gym-tracker
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Seeding
1. Open your MySQL client (CLI or MySQL Workbench) and create the database:
   ```sql
   CREATE DATABASE smart_gym_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Import the schema, views, and triggers:
   ```bash
   mysql -u root -p smart_gym_db < database/schema.sql
   ```
3. Populate realistic initial data:
   ```bash
   node seed.js
   ```

### 5. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update your database password in `.env`:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=smart_gym_db
SESSION_SECRET=ironpulse_super_secret_session_key_2026

# Gmail SMTP Configuration (Optional for real email dispatch)
SMTP_SERVICE=gmail
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
MAIL_FROM="IronPulse Gym" <your_email@gmail.com>
```

### 6. Start the Server
```bash
npm run dev
# Or: npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔐 Default Test Credentials

| Role | Email | Password | Access Portal |
| :--- | :--- | :--- | :--- |
| **Admin** | `arthur@ironpulse.com` | `password123` | [Admin Portal](http://localhost:3000/admin/) |
| **Trainer** | `trainer1@ironpulse.com` | `password123` | [Trainer Portal](http://localhost:3000/trainer/) |
| **Member** | `member1@ironpulse.com` | `password123` | [Member Portal](http://localhost:3000/member/) |

---

## 📖 Evaluation & Viva Documentation

The complete 10-page master evaluation guide is included in the root directory:
* **[VIVA_AND_PROJECT_MASTER_GUIDE.md](./VIVA_AND_PROJECT_MASTER_GUIDE.md)**: Complete guide covering folder architecture, DBMS presentation speech script, active triggers code, and Top 25 Viva Q&As.
* **[IronPulse_DBMS_Project_and_Viva_Master_Guide.pdf](./IronPulse_DBMS_Project_and_Viva_Master_Guide.pdf)**: Print-ready, executive PDF version.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
