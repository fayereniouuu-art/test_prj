const mysql = require("mysql");
require('dotenv').config();

const con = mysql.createPool({
    connectionLimit : 20, 
    host: process.env.MYSQL_HOST,  
    port: process.env.MYSQL_PORT || 10306, 
    user: process.env.MYSQL_USER, 
    password: process.env.MYSQL_PASSWORD, 
    database: process.env.MYSQL_DATABASE || 'defaultdb', 
    ssl: {
        rejectUnauthorized: false // ⭐ จำเป็นมากสำหรับการต่อ Aiven จากภายนอก
    },
    charset: 'utf8mb4',
    timezone: '+07:00', 
    dateStrings: true   
});   

con.getConnection(function(err, connection) {
    if (err) {
        console.error('ERP Error connecting : ' + err.stack);
        return;
    } 
    console.log('Database connected successfully!'); 
    connection.release();
});

module.exports = con;
