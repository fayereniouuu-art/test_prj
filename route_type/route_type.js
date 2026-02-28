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
// GET: ดึงข้อมูลประเภทเส้นทางทั้งหมด (Public)
router.get('/route_types', async (req, res) => {
    try {
        const sql = "SELECT route_type_id, route_type, is_fixed_route FROM route_type ORDER BY route_type ASC";
        const result = await query(sql);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching route types:', error);
        res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดในการดึงข้อมูลประเภทเส้นทาง"
        });
    }
});


// POST: เพิ่มข้อมูลประเภทเส้นทางใหม่
router.post('/route_types', verifyToken, isAdmin, async (req, res) => {
    try {
        const { route_type, uses_fixed_points } = req.body;
        
        const isFixedRoute = (uses_fixed_points === 'true' || uses_fixed_points === true) ? 1 : 0;
        
        const checkSql = "SELECT COUNT(*) AS count FROM route_type WHERE route_type = ?";
        const checkResult = await query(checkSql, [route_type]);

        if (checkResult[0].count > 0) {
            return res.json({
                status: "1",
                message: "ชื่อประเภทเส้นทางนี้มีอยู่แล้ว"
            });
        }
        
        const insertSql = "INSERT INTO route_type (route_type, is_fixed_route) VALUES (?, ?)";
        await query(insertSql, [route_type, isFixedRoute]);

        res.json({
            status: "0",
            message: "บันทึกข้อมูลประเภทเส้นทางสำเร็จ"
        });
    } catch (error) {
        console.error('Error saving new route type:', error);
        res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message
        });
    }
});

/*-----------------------------------------------------------------------------------------------------------------------------*/
// PUT: อัปเดตข้อมูลประเภทเส้นทาง
router.put('/route_types/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { route_type, uses_fixed_points } = req.body;

        const isFixedRoute = (uses_fixed_points === 'true' || uses_fixed_points === true) ? 1 : 0;

        const checkDuplicateSql = "SELECT COUNT(*) AS count FROM route_type WHERE route_type = ? AND route_type_id != ?";
        const checkDuplicateResult = await query(checkDuplicateSql, [route_type, id]);

        if (checkDuplicateResult[0].count > 0) {
            return res.json({
                status: "1",
                message: "ชื่อประเภทเส้นทางนี้มีอยู่แล้ว"
            });
        }

        const sql = "UPDATE route_type SET route_type = ?, is_fixed_route = ? WHERE route_type_id = ?";
        const result = await query(sql, [route_type, isFixedRoute, id]);

        if (result.affectedRows === 0) {
            return res.json({
                status: "1",
                message: "ไม่พบข้อมูลประเภทเส้นทางที่จะแก้ไข"
            });
        }

        res.json({
            status: "0",
            message: "แก้ไขข้อมูลประเภทเส้นทางสำเร็จ"
        });
    } catch (error) {
        console.error('Error updating route type:', error);
        res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูล: " + error.message
        });
    }
});

/*-----------------------------------------------------------------------------------------------------------------------------*/

// DELETE: ลบประเภทเส้นทาง
router.delete('/route_types/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const sql = "DELETE FROM route_type WHERE route_type_id = ?";
        const result = await query(sql, [id]);

        if (result.affectedRows === 0) {
            return res.json({
                status: "1",
                message: "ไม่พบข้อมูลประเภทเส้นทางที่จะลบ"
            });
        }

        res.json({
            status: "0",
            message: "ลบข้อมูลประเภทเส้นทางสำเร็จ"
        });
    } catch (error) {
        console.error('Error deleting route type:', error);
        res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดในการลบข้อมูล: " + error.message
        });
    }
});

module.exports = router;