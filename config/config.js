const mysql = require("mysql");
require('dotenv').config()

const con = mysql.createPool({
    connectionLimit : 20, // แนะนำให้เปิดไว้ (กำหนดจำนวนการเชื่อมต่อพร้อมกันสูงสุด)
    host: process.env.MYSQL_HOST,  
    user: process.env.MYSQL_USER, 
    password: process.env.MYSQL_PASSWORD, 
    database: process.env.MYSQL_DATABASE, 
    charset: process.env.MYSQL_CHARSET,
    port: process.env.MYSQL_PORT,
    timezone: '+07:00', // ⭐ เพิ่มบรรทัดนี้ เพื่อตั้งให้ Node.js บันทึก/อ่านเวลาเป็นเวลาประเทศไทยเสมอ
    dateStrings: true   // ⭐ เพิ่มบรรทัดนี้ (Option) เพื่อให้เวลาที่ Query ออกมาเป็น String อ่านง่าย ไม่เพี้ยน
});   

con.getConnection(function(err, connection) {
    if (err) {
        console.error('ERP Error connecting : '+err.stack);
        return;
    } 
    console.log('Database connected successfully!'); // ลองใส่ log ไว้ดูว่าต่อ DB สำเร็จไหม
    connection.release();
});

module.exports = con;