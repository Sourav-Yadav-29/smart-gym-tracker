const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_gym_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDatabase() {
    try {
        // Ensure base extension tables exist
        await pool.query(`CREATE TABLE IF NOT EXISTS Member_Biometrics (
            biometric_id INT AUTO_INCREMENT PRIMARY KEY,
            member_id INT NOT NULL UNIQUE,
            height_cm DECIMAL(5,2) NOT NULL DEFAULT 175.00,
            weight_kg DECIMAL(5,2) NOT NULL DEFAULT 75.00,
            bmi DECIMAL(4,1) NOT NULL DEFAULT 24.5,
            body_fat_pct DECIMAL(4,1) DEFAULT 15.0,
            fitness_goal VARCHAR(100) DEFAULT 'Lean Hypertrophy',
            trainer_notes VARCHAR(255) DEFAULT 'Maintain high-protein diet and progressive overload.',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS Member_Access_Logs (
            log_id INT AUTO_INCREMENT PRIMARY KEY,
            member_id INT NOT NULL,
            login_time DATETIME NOT NULL,
            logout_time DATETIME DEFAULT NULL,
            duration_minutes INT DEFAULT NULL,
            ip_address VARCHAR(45) DEFAULT '127.0.0.1',
            session_status ENUM('Online', 'Logged Out') DEFAULT 'Online',
            FOREIGN KEY (member_id) REFERENCES Members(member_id) ON DELETE CASCADE
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS Client_Workouts (
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
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS System_Notifications (
            notification_id INT AUTO_INCREMENT PRIMARY KEY,
            recipient_role ENUM('admin', 'trainer', 'member', 'all') NOT NULL DEFAULT 'all',
            recipient_id INT NOT NULL DEFAULT 0,
            actor_name VARCHAR(100) NOT NULL,
            category VARCHAR(40) NOT NULL DEFAULT 'System',
            message VARCHAR(255) NOT NULL,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await pool.query(`CREATE OR REPLACE VIEW Trainer_Assigned_View AS
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
        LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id`);

        console.log('✅ Connected to MySQL database and verified tables.');
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
    }
}

initDatabase();

module.exports = pool;
