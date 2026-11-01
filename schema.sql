-- IronPulse Smart Gym & Fitness Membership Tracker MySQL Schema, Notifications & Triggers

CREATE DATABASE IF NOT EXISTS smart_gym_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_gym_db;

-- 1. Membership_Plans Table
CREATE TABLE IF NOT EXISTS Membership_Plans (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(50) NOT NULL,
    duration_months INT NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

-- 2. Members Table
CREATE TABLE IF NOT EXISTS Members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    membership_plan_id INT,
    plan_end_date DATE NOT NULL,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    FOREIGN KEY (membership_plan_id) REFERENCES Membership_Plans(plan_id) ON DELETE SET NULL
);

-- 3. Trainers Table
CREATE TABLE IF NOT EXISTS Trainers (
    trainer_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    specialization VARCHAR(100),
    contact_email VARCHAR(100)
);

-- 4. Admins Table
CREATE TABLE IF NOT EXISTS Admins (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- 5. Slot_Bookings Table
CREATE TABLE IF NOT EXISTS Slot_Bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    trainer_id INT NOT NULL,
    slot_time VARCHAR(50) NOT NULL,
    locker_number VARCHAR(20),
    FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES Trainers(trainer_id) ON DELETE CASCADE
);

-- 6. Payments Table
CREATE TABLE IF NOT EXISTS Payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    method VARCHAR(50) DEFAULT 'Credit Card',
    FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE
);

-- 7. Member_Biometrics Table
CREATE TABLE IF NOT EXISTS Member_Biometrics (
    biometric_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL UNIQUE,
    height_cm DECIMAL(5,2) NOT NULL DEFAULT 175.00,
    weight_kg DECIMAL(5,2) NOT NULL DEFAULT 75.00,
    bmi DECIMAL(4,1) NOT NULL DEFAULT 24.5,
    body_fat_pct DECIMAL(4,1) DEFAULT 15.0,
    fitness_goal VARCHAR(100) DEFAULT 'Lean Hypertrophy',
    trainer_notes VARCHAR(255) DEFAULT 'Maintain 2g/kg protein intake and progressive overload.',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE
);

-- 8. Member_Access_Logs Table (Admin-Only Login / Logout Audit Log)
CREATE TABLE IF NOT EXISTS Member_Access_Logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    login_time DATETIME NOT NULL,
    logout_time DATETIME DEFAULT NULL,
    duration_minutes INT DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT '127.0.0.1',
    session_status ENUM('Online', 'Logged Out') DEFAULT 'Online',
    FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE
);

-- 9. Client_Workouts Table
CREATE TABLE IF NOT EXISTS Client_Workouts (
    workout_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    trainer_id INT DEFAULT NULL,
    exercise_name VARCHAR(120) NOT NULL,
    muscle_group VARCHAR(50) NOT NULL,
    sets INT NOT NULL DEFAULT 3,
    reps INT NOT NULL DEFAULT 10,
    weight_kg DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    workout_date DATE NOT NULL,
    FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES Trainers(trainer_id) ON DELETE SET NULL
);

-- 10. System_Notifications Table (Top-Right Bell Notification Center)
CREATE TABLE IF NOT EXISTS System_Notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_role ENUM('admin', 'trainer', 'member', 'all') NOT NULL DEFAULT 'all',
    recipient_id INT NOT NULL DEFAULT 0,
    actor_name VARCHAR(100) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'System',
    message VARCHAR(255) NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Restricted SQL View for Trainers
CREATE OR REPLACE VIEW Trainer_Assigned_View AS
SELECT
    t.trainer_id,
    t.name AS trainer_name,
    m.member_id,
    m.name AS member_name,
    m.email AS member_email,
    m.phone AS member_phone,
    m.status AS member_status,
    m.plan_end_date,
    s.booking_id,
    s.slot_time,
    s.locker_number,
    COALESCE(b.height_cm, 175.0) AS height_cm,
    COALESCE(b.weight_kg, 75.0) AS weight_kg,
    COALESCE(b.bmi, 24.5) AS bmi,
    COALESCE(b.body_fat_pct, 15.0) AS body_fat_pct,
    COALESCE(b.fitness_goal, 'General Fitness') AS fitness_goal,
    COALESCE(b.trainer_notes, 'No notes yet.') AS trainer_notes
FROM Slot_Bookings s
JOIN Members m ON s.member_id = m.member_id
JOIN Trainers t ON s.trainer_id = t.trainer_id
LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id;

-- 12. Automated Trigger: Check & Set Member Inactive if plan_end_date < CURRENT_DATE()
DELIMITER //
DROP TRIGGER IF EXISTS trg_check_membership_expiry //
CREATE TRIGGER trg_check_membership_expiry
BEFORE UPDATE ON Members
FOR EACH ROW
BEGIN
    IF NEW.plan_end_date < CURDATE() THEN
        SET NEW.status = 'Inactive';
    END IF;
END //
DELIMITER ;