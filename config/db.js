const mysql = require('mysql');

const con = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-d5b161e-hosapi123.j.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_gJv8rYDINF4SvFPus4E',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 10306, // ใช้พอร์ตที่คุณระบุมา
    ssl: {
        rejectUnauthorized: false // จำเป็นสำหรับการเชื่อมต่อภายนอกเข้าสู่ Aiven
    }
});

module.exports = con;
