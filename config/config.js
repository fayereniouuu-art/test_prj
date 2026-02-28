const mysql = require("mysql");
require('dotenv').config()

const con = mysql.createPool({
    connectionLimit : 20, 
    host: 'mysql-d5b161e-hosapi123.j.aivencloud.com', //
    port: 10306, //
    user: 'avnadmin', //
    password: 'AVNS_gJv8rYDINF4SvFPus4E', //
    database: 'defaultdb', //
    ssl: {
        rejectUnauthorized: false
    }, 
    timezone: '+07:00', 
    dateStrings: true   
});   

con.getConnection(function(err, connection) {
    if (err) {
        console.error('ERP Error connecting : '+err.stack);
        return;
    } 
    console.log('Database connected successfully!'); 
    connection.release();
});

module.exports = con;
