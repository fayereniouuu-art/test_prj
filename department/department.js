const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const con = require('../config/config');
const { promisify } = require('util');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var router = express.Router();
const query = promisify(con.query).bind(con);

// นำเข้า Middleware ตรวจสอบสิทธิ์
const { verifyToken, isAdmin } = require('../middleware/auth');

/*-----------------------------------------------------------------------------------------------------------------------------*/
// GET: ดึงข้อมูลแผนกทั้งหมด (ให้ดึงข้อมูลได้อิสระ)
router.get('/departments', async (req, res) => {
    try {
        const sql = "SELECT * FROM departments ORDER BY department_name ASC";
        const results = await query(sql);
        res.status(200).json(results);
    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลแผนก" });
    }
});

// POST: เพิ่มแผนกใหม่
router.post('/departments', verifyToken, isAdmin, async (req, res) => {
    const { department_name } = req.body;

    if (!department_name || department_name.trim() === '') {
        return res.status(400).json({ message: "กรุณากรอกชื่อแผนก" });
    }

    try {
        const sql = "INSERT INTO departments (department_name) VALUES (?)";
        const result = await query(sql, [department_name.trim()]);
        res.status(201).json({ message: "เพิ่มแผนกใหม่สำเร็จ", insertedId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "มีแผนกชื่อนี้อยู่ในระบบแล้ว" });
        }
        console.error("Error creating department:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มแผนกใหม่" });
    }
});

// PUT: แก้ไข/อัปเดตชื่อแผนก
router.put('/departments/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { department_name } = req.body;

    if (!department_name || department_name.trim() === '') {
        return res.status(400).json({ message: "กรุณากรอกชื่อแผนกใหม่" });
    }

    try {
        const sql = "UPDATE departments SET department_name = ? WHERE department_id = ?";
        const result = await query(sql, [department_name.trim(), id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "ไม่พบแผนกที่ต้องการแก้ไข" });
        }

        res.status(200).json({ message: "อัปเดตข้อมูลแผนกสำเร็จ" });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "มีแผนกชื่อนี้อยู่ในระบบแล้ว" });
        }
        console.error("Error updating department:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล" });
    }
});

// DELETE: ลบแผนก
router.delete('/departments/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ message: "ไม่ได้ระบุ ID ของแผนก" });
    }

    try {
        const sql = "DELETE FROM departments WHERE department_id = ?";
        const result = await query(sql, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "ไม่พบแผนกที่ต้องการลบ" });
        }

        res.status(200).json({ message: "ลบแผนกสำเร็จ" });

    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ message: "ไม่สามารถลบแผนกนี้ได้ เนื่องจากมีข้อมูลบุคลากรหรือข้อมูลอื่นเชื่อมโยงอยู่" });
        }
        console.error("Error deleting department:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
    }
});

module.exports = router;