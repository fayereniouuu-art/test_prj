const express = require('express');
const bcrypt = require('bcrypt');
const con = require('../config/config');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');

// นำเข้า isOwnerOrAdmin จากไฟล์ middleware
const { verifyToken, isAdmin, isOwnerOrAdmin } = require('../middleware/auth'); 

var router = express.Router();
const query = promisify(con.query).bind(con);

/*---------------------------------------------------------------------------------------*/

// 1. GET /accounts -> ดึงข้อมูลผู้ใช้ทั้งหมด (เฉพาะ Admin)
router.get('/accounts', verifyToken, isAdmin, async (req, res) => {
    try {
        const sql = "SELECT id, first_name, last_name, department, username, role, status, created_at FROM accounts ORDER BY created_at DESC";
        const results = await query(sql);
        res.status(200).json(results);
    } catch (error) {
        console.error("Error fetching accounts:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชี" });
    }
});

// 2. GET /accounts/:id -> ดึงข้อมูลรายบุคคล (Admin หรือ เจ้าของข้อมูล)
router.get('/accounts/:id', verifyToken, isOwnerOrAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const sql = "SELECT id, first_name, last_name, department, username, role, status, created_at FROM accounts WHERE id = ?";
        const results = await query(sql, [id]);
        if (results.length === 0) return res.status(404).json({ message: "ไม่พบบัญชี" });
        res.status(200).json(results[0]);
    } catch (error) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
    }
});

// 3. POST /accounts -> สร้างบัญชีใหม่
router.post('/accounts', async (req, res) => {
    const { first_name, last_name, department, username, password, role, status } = req.body;
    
    if (!first_name || !last_name || !department || !username || !password) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const finalStatus = status || 'pending';
        const finalRole = role || 'user';

        const sql = "INSERT INTO accounts (first_name, last_name, department, username, password, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)";
        await query(sql, [first_name, last_name, department, username, hashedPassword, finalRole, finalStatus]);
        
        res.status(201).json({ message: "สร้างบัญชีผู้ใช้งานสำเร็จ!" });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Username นี้ถูกใช้งานแล้ว" });
        res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
    }
});

// 4. PUT /accounts/:id -> แก้ไขข้อมูล/อัปเดตรหัสผ่าน (Admin หรือ เจ้าของข้อมูล)
router.put('/accounts/:id', verifyToken, isOwnerOrAdmin, async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, department, username, role, password, status } = req.body;
    
    if (!first_name || !last_name || !department || !username || !role) {
        return res.status(400).json({ message: "กรุณาส่งข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    try {
        let sql;
        let params;
        const currentStatus = status || 'active'; 

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            sql = "UPDATE accounts SET first_name = ?, last_name = ?, department = ?, username = ?, role = ?, password = ?, status = ? WHERE id = ?";
            params = [first_name, last_name, department, username, role, hashedPassword, currentStatus, id];
        } else {
            sql = "UPDATE accounts SET first_name = ?, last_name = ?, department = ?, username = ?, role = ?, status = ? WHERE id = ?";
            params = [first_name, last_name, department, username, role, currentStatus, id];
        }

        const result = await query(sql, params);
        if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบบัญชีที่ต้องการแก้ไข" });
        
        res.status(200).json({ message: "อัปเดตข้อมูลสำเร็จ" });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Username ซ้ำ" });
        res.status(500).json({ message: "เซิร์ฟเวอร์ขัดข้อง" });
    }
});

// 5. DELETE /accounts/:id -> ลบบัญชี (เฉพาะ Admin)
router.delete('/accounts/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query("DELETE FROM accounts WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบบัญชี" });
        res.status(200).json({ message: "ลบบัญชีสำเร็จ" });
    } catch (error) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
    }
});

// 6. POST /login -> สร้าง Token
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });

    try {
        const results = await query("SELECT * FROM accounts WHERE username = ?", [username]);
        if (results.length === 0) return res.status(401).json({ message: "ไม่พบชื่อผู้ใช้นี้" });

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });

        const token = jwt.sign(
            { id: user.id, role: user.role }, 
            'YOUR_SECRET_KEY', 
            { expiresIn: '1d' } 
        );

        res.status(200).json({
            status: "success",
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                status: user.status 
            },
            token: token 
        });
    } catch (error) {
        res.status(500).json({ message: "เซิร์ฟเวอร์ขัดข้อง" });
    }
});

// บรรทัดนี้คือหัวใจสำคัญที่ห้ามหายครับ!
module.exports = router;