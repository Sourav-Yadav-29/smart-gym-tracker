# IronPulse — Smart Gym & Fitness Management System

Powered by **Node.js + Express + MySQL + EJS**. (PHP & XAMPP Apache fully removed).

---

## 🚀 Quick Setup for Collaborators

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- MySQL Server (via standalone MySQL, MySQL Workbench, or MariaDB on port 3306)

### 2. Database Setup
1. Open your MySQL client (CLI, MySQL Workbench, or phpMyAdmin).
2. Create database:
   ```sql
   CREATE DATABASE smart_gym_db;
   ```
3. Import `schema.sql`:
   ```bash
   mysql -u root -p smart_gym_db < schema.sql
   ```
   *(Or import `schema.sql` via phpMyAdmin / MySQL Workbench import tab).*

### 3. Install Dependencies & Configure
1. Open terminal in the project directory:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   # On Windows PowerShell:
   Copy-Item .env.example .env
   ```
3. Adjust DB credentials in `.env` if your MySQL root has a password.

### 4. Start the Application
```bash
npm start
```
Or:
```bash
node server.js
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔐 Default Portals & Logins

| Role | Email | Password | Portal URL |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@ironpulse.com` | `password123` | `http://localhost:3000/admin` |
| **Trainer** | `trainer1@ironpulse.com` | `password123` | `http://localhost:3000/dashboard` |
| **Member** | `member1@ironpulse.com` | `password123` | `http://localhost:3000/member` |

*Quick Access buttons are also available directly on the login page.*

---

## 📁 Project Architecture
```
smart-gym-tracker-node/
├── .env.example         # Template for environment variables
├── .gitignore           # Ignores node_modules and .env
├── db.js                # MySQL connection pool & automatic table provisioning
├── helpers.js           # Currency, formatting, BMI, and badge helpers
├── reportService.js     # Analytics and CSV export aggregations
├── schema.sql           # Complete MySQL database dump
├── server.js            # Express server & all route controllers
├── public/              # Static CSS, JS, images, logos
│   ├── admin/assets/    # Admin panel styling & charts
│   └── member/assets/   # Member portal styling & dynamic calculator
└── views/               # EJS template views
    ├── login.ejs        # Login page with role switcher & quick access
    ├── dashboard.ejs    # Trainer dashboard
    ├── admin/           # Admin portal layout & modular tabs
    └── member/          # Redesigned member portal views
```
