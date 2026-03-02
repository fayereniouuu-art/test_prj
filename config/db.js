const mysql = require('mysql');

// ตั้งค่าฐานข้อมูลของคุณ
const con = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-d5b161e-hosapi123.j.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_gJv8rYDINF4SvFPus4E',
    database: process.env.DB_NAME || 'defaultdb'
});

module.exports = con;
