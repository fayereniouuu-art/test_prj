const mysql = require("mysql2");
require('dotenv').config();

const con = mysql.createPool({
    connectionLimit : 20, 
    // ดึงค่าจาก Environment Variables ที่ตั้งไว้บน Render
    host: process.env.MYSQL_HOST,  
    port: process.env.MYSQL_PORT || 10306, 
    user: process.env.MYSQL_USER, 
    password: process.env.MYSQL_PASSWORD, 
    database: 'defaultdb', 
    
    // ⭐ ส่วนสำคัญ: บังคับใช้ SSL เพื่อเชื่อมต่อกับ Aiven Cloud
    ssl: {
        rejectUnauthorized: false
    },
    
    charset: 'utf8mb4',
    timezone: '+07:00', 
    dateStrings: true,

    // 🟢 เพิ่มการตั้งค่าเพื่อป้องกันการหลุด (Auto Reconnect & Keep Alive)
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,          // เปิดฟีเจอร์เลี้ยงการเชื่อมต่อไว้ไม่ให้หลับ (ป้องกัน ETIMEDOUT / ECONNRESET)
    keepAliveInitialDelay: 10000    // ส่งสัญญาณ Ping ทุกๆ 10 วินาที เพื่อกวน Database ไม่ให้ตัดสาย
});   

// ตรวจสอบการเชื่อมต่อครั้งแรกตอน Start Server
con.getConnection(function(err, connection) {
    if (err) {
        console.error('ERP Error connecting : ', err.message);
        // 📌 ไม่ต้องหยุดการทำงานของระบบ เพราะเดี๋ยว Pool จะพยายามต่อใหม่ให้เองเมื่อมีคนใช้งาน
    } else {
        console.log('Database connected successfully!'); 
        connection.release(); // อย่าลืมคืน connection กลับเข้า pool
    }
});

// 🟢 ดักจับ Error ระดับ Pool ป้องกันไม่ให้แอป (Node.js) ดับเมื่อเน็ตเวิร์คมีปัญหาชั่วคราว
con.on('error', (err) => {
    console.error('Database pool error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        console.log('⚠️ Database connection lost. Pool will auto-reconnect on the next query.');
    }
});

module.exports = con;

