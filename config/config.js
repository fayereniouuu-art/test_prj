const mysql = require('mysql'); // หรือ mysql2

// ใช้ createPool แทน createConnection
const con = mysql.createPool({
    connectionLimit: 10, // จำนวนการเชื่อมต่อพร้อมกันสูงสุด
    host: 'mysql-d5b161e-hosapi123.j.aivencloud.com',
    user: 'your_username',
    password: 'your_password',
    database: 'your_database_name',
    port: 3306, // หรือพอร์ตที่คุณใช้งาน
    waitForConnections: true,
    queueLimit: 0
});

// ไม่ต้องมีคำสั่ง con.connect() เพราะ Pool จะจัดการให้เองตอนที่มีการ Query

module.exports = con;
