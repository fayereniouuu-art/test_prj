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
// Helper function 
/*-----------------------------------------------------------------------------------------------------------------------------*/
function calculateCentroid(polygonCorners) {
    let sumX = 0;
    let sumY = 0;
    polygonCorners.forEach(p => {
        sumX += parseFloat(p.x);
        sumY += parseFloat(p.y);
    });
    return { x: sumX / polygonCorners.length, y: sumY / polygonCorners.length };
}

function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = parseFloat(polygon[i].x);
        const yi = parseFloat(polygon[i].y);
        const xj = parseFloat(polygon[j].x);
        const yj = parseFloat(polygon[j].y);

        const intersect = ((yi > point.y) != (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/*-----------------------------------------------------------------------------------------------------------------------------*/
// จัดการข้อมูลอาคาร
/*-----------------------------------------------------------------------------------------------------------------------------*/

// GET: ดึงข้อมูลอาคารทั้งหมด
router.get('/allData', async (req, res) => {
    try {
        const searchTerm = req.query.building_name;
        let sqlQuery = 'SELECT building_id, building_name FROM `building`';
        const queryParams = [];

        if (searchTerm) {
            sqlQuery += ' WHERE building_name LIKE ?';
            queryParams.push(`%${searchTerm}%`);
        }
        
        sqlQuery += ' ORDER BY building_name ASC';

        const results = await query(sqlQuery, queryParams);

        res.status(200).send({ status: "success", data: results });

    } catch (error) {
        console.error('Error in /allData (GET):', error);
        res.status(500).send({ status: "error", message: "เกิดข้อผิดพลาดในการดึงข้อมูลอาคาร" });
    }
});

// GET: ดึงข้อมูลอาคารเดี่ยว
router.get('/building/:id', async (req, res) => {
    try {
        const buildingId = req.params.id;
        const sqlQuery = 'SELECT * FROM `building` WHERE building_id = ?';
        const [result] = await query(sqlQuery, [buildingId]);

        if (result) {
            res.status(200).send({ status: "success", data: result });
        } else {
            res.status(404).send({ status: "error", message: "ไม่พบข้อมูลอาคาร" });
        }
    } catch (error) {
        console.error('Error in /building/:id (GET):', error);
        res.status(500).send({ status: "error", message: "เกิดข้อผิดพลาดในการดึงข้อมูลอาคาร" });
    }
});

// POST: เพิ่มข้อมูลอาคาร
router.post('/building', verifyToken, isAdmin, async (req, res) => {
    try {
        const { building_name } = req.body;
        if (!building_name) {
            return res.status(400).send({ status: "error", message: "กรุณาระบุชื่ออาคาร" });
        }
        const sqlQuery = 'INSERT INTO `building` (building_name) VALUES (?)';
        await query(sqlQuery, [building_name]);
        res.status(201).send({ status: "success", message: "เพิ่มข้อมูลอาคารสำเร็จ" });
    } catch (error) {
        console.error('Error in /building (POST):', error);
        res.status(500).send({ status: "error", message: "เกิดข้อผิดพลาดในการเพิ่มข้อมูลอาคาร" });
    }
});

// PUT: อัปเดตข้อมูลอาคาร
router.put('/building/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { building_name } = req.body;
        if (!building_name) {
            return res.status(400).send({ status: "error", message: "กรุณาระบุชื่ออาคารที่ต้องการอัปเดต" });
        }
        const sqlQuery = 'UPDATE `building` SET building_name = ? WHERE building_id = ?';
        await query(sqlQuery, [building_name, id]);
        res.status(200).send({ status: "success", message: "อัปเดตข้อมูลอาคารสำเร็จ" });
    } catch (error) {
        console.error('Error in /building/:id (PUT):', error);
        res.status(500).send({ status: "error", message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูลอาคาร" });
    }
});

// DELETE: ลบข้อมูลอาคาร
router.delete('/building/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const sqlQuery = 'DELETE FROM `building` WHERE building_id = ?';
        await query(sqlQuery, [id]);
        res.status(200).send({ status: "success", message: "ลบข้อมูลอาคารสำเร็จ" });
    } catch (error) {
        console.error('Error in /building/:id (DELETE):', error);
        res.status(500).send({ status: "error", message: "เกิดข้อผิดพลาดในการลบข้อมูลอาคาร" });
    }
});

/*-----------------------------------------------------------------------------------------------------------------------------*/
// จัดการข้อมูลพิกัด (Reference Points)
/*-----------------------------------------------------------------------------------------------------------------------------*/

router.get('/reference_points', async (req, res) => {
    try {
        // เอา latitude, longitude ออกแล้ว
        const sqlQuery = `
            SELECT 
                rp.reference_points_id,
                rp.building_id,
                b.building_name, 
                rp.corner1_coord_x, rp.corner1_coord_y,
                rp.corner2_coord_x, rp.corner2_coord_y,
                rp.corner3_coord_x, rp.corner3_coord_y,
                rp.corner4_coord_x, rp.corner4_coord_y,
                rp.building_image_path 
            FROM \`reference_points\` rp
            JOIN \`building\` b ON rp.building_id = b.building_id
            ORDER BY b.building_name ASC
        `;
        const results = await query(sqlQuery);

        return res.status(200).json({
            status: "success",
            data: results
        });
    } catch (error) {
        console.error('Error in /reference_points (GET):', error);
        return res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดในการดึงข้อมูลพิกัดขอบเขต"
        });
    }
});

router.get('/reference_point/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sqlQuery = 'SELECT * FROM `reference_points` WHERE reference_points_id = ?';
        const [result] = await query(sqlQuery, [id]);
        if (result) {
            return res.status(200).json({
                status: "success",
                data: result
            });
        } else {
            return res.status(404).json({
                status: "error",
                message: "ไม่พบข้อมูลพิกัดขอบเขต"
            });
        }
    } catch (error) {
        console.error('Error in /reference_point/:id (GET):', error);
        return res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดในการดึงข้อมูลพิกัดขอบเขต"
        });
    }
});

// POST: เพิ่มพิกัดขอบเขตใหม่
router.post('/reference_point', verifyToken, isAdmin, async (req, res) => {
    const { 
        building_id,
        corner1_coord_x, corner1_coord_y,
        corner2_coord_x, corner2_coord_y,
        corner3_coord_x, corner3_coord_y,
        corner4_coord_x, corner4_coord_y,
        building_image_path 
    } = req.body;

    const missingFields = [];
    if (!building_id) missingFields.push('building_id');
    if (corner1_coord_x === null || corner1_coord_x === undefined) missingFields.push('corner1_coord_x');
    if (corner1_coord_y === null || corner1_coord_y === undefined) missingFields.push('corner1_coord_y');
    if (corner2_coord_x === null || corner2_coord_x === undefined) missingFields.push('corner2_coord_x');
    if (corner2_coord_y === null || corner2_coord_y === undefined) missingFields.push('corner2_coord_y');
    if (corner3_coord_x === null || corner3_coord_x === undefined) missingFields.push('corner3_coord_x');
    if (corner3_coord_y === null || corner3_coord_y === undefined) missingFields.push('corner3_coord_y');
    if (corner4_coord_x === null || corner4_coord_x === undefined) missingFields.push('corner4_coord_x');
    if (corner4_coord_y === null || corner4_coord_y === undefined) missingFields.push('corner4_coord_y');

    if (missingFields.length > 0) {
        return res.status(400).send({
            status: 'error',
            message: `กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.join(', ')}`,
            missingFields: missingFields
        });
    }

    try {
        const coords = [
            { x: parseFloat(corner1_coord_x), y: parseFloat(corner1_coord_y) },
            { x: parseFloat(corner2_coord_x), y: parseFloat(corner2_coord_y) },
            { x: parseFloat(corner3_coord_x), y: parseFloat(corner3_coord_y) },
            { x: parseFloat(corner4_coord_x), y: parseFloat(corner4_coord_y) }
        ];
        
        const buildingInfo = await query('SELECT building_name FROM `building` WHERE building_id = ?', [building_id]);
        if (buildingInfo.length === 0) {
            return res.status(404).send({
                status: 'error',
                message: 'ไม่พบ Building ID ที่ระบุในฐานข้อมูล'
            });
        }
        
        let duplicateMessages = [];

        const existingBuildingEntry = await query('SELECT * FROM `reference_points` WHERE building_id = ?', [building_id]);
        if (existingBuildingEntry.length > 0) {
            duplicateMessages.push(`อาคาร "${buildingInfo[0].building_name}" นี้มีจุดอ้างอิงอยู่แล้ว`);
        }

        const allExistingPoints = await query(`
            SELECT rp.building_id, b.building_name, 
            rp.corner1_coord_x, rp.corner1_coord_y,
            rp.corner2_coord_x, rp.corner2_coord_y,
            rp.corner3_coord_x, rp.corner3_coord_y,
            rp.corner4_coord_x, rp.corner4_coord_y
            FROM \`reference_points\` rp
            JOIN \`building\` b ON rp.building_id = b.building_id
        `);

        const newPolygonCentroid = calculateCentroid(coords);
        for (const existingRow of allExistingPoints) {
            const existingPolygonCorners = [
                { x: parseFloat(existingRow.corner1_coord_x), y: parseFloat(existingRow.corner1_coord_y) },
                { x: parseFloat(existingRow.corner2_coord_x), y: parseFloat(existingRow.corner2_coord_y) },
                { x: parseFloat(existingRow.corner3_coord_x), y: parseFloat(existingRow.corner3_coord_y) },
                { x: parseFloat(existingRow.corner4_coord_x), y: parseFloat(existingRow.corner4_coord_y) }
            ];

            if (isPointInPolygon(newPolygonCentroid, existingPolygonCorners) || 
                coords.some(c => isPointInPolygon(c, existingPolygonCorners))) {
                duplicateMessages.push(`การกำหนดขอบเขตซ้ำกับบริเวณที่เคยกำหนดไปแล้วของตึก "${existingRow.building_name}"`);
            }
            const existingPolygonCentroid = calculateCentroid(existingPolygonCorners);
            if (isPointInPolygon(existingPolygonCentroid, coords) || 
                existingPolygonCorners.some(c => isPointInPolygon(c, coords))) {
                duplicateMessages.push(`การกำหนดขอบเขตซ้ำกับบริเวณที่เคยกำหนดไปแล้วของตึก "${existingRow.building_name}"`);
            }
        }
        
        duplicateMessages = [...new Set(duplicateMessages)];
        
        if (duplicateMessages.length > 0) {
            return res.status(409).send({
                status: 'error',
                message: 'ไม่สามารถบันทึกได้เนื่องจากข้อมูลซ้ำ',
                duplicates: duplicateMessages
            });
        }
        
        const insertQuery = `
            INSERT INTO \`reference_points\` 
            (building_id, 
             corner1_coord_x, corner1_coord_y, 
             corner2_coord_x, corner2_coord_y, 
             corner3_coord_x, corner3_coord_y, 
             corner4_coord_x, corner4_coord_y, 
             building_image_path) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const insertParams = [
            building_id,
            coords[0].x, coords[0].y,
            coords[1].x, coords[1].y,
            coords[2].x, coords[2].y,
            coords[3].x, coords[3].y,
            building_image_path || null 
        ];

        const insertResult = await query(insertQuery, insertParams);

        if (insertResult.affectedRows > 0) {
            return res.status(201).send({
                status: 'success',
                message: 'บันทึกจุดอ้างอิงขอบเขตสำเร็จ!',
                reference_point_id: insertResult.insertId
            });
        } else {
            return res.status(500).send({
                status: 'error',
                message: 'ไม่สามารถบันทึกจุดอ้างอิงขอบเขตได้'
            });
        }

    } catch (error) {
        console.error('Error in /reference_point (POST):', error);
        return res.status(500).send({
            status: 'error',
            message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะบันทึกจุดอ้างอิงขอบเขต: ' + error.message
        });
    }
});

// DELETE: ลบข้อมูลพิกัดของอาคาร
router.delete('/reference_point/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const referencePointId = req.params.id;
        if (!referencePointId || isNaN(parseInt(referencePointId))) {
            return res.status(400).json({
                status: "error",
                message: "ID ไม่ถูกต้อง กรุณาระบุ ID ที่เป็นตัวเลข"
            });
        }
        const result = await query('DELETE FROM `reference_points` WHERE reference_points_id = ?', [referencePointId]);

        if (result.affectedRows > 0) {
            res.status(200).json({
                status: "success",
                message: "ลบข้อมูลพิกัดของอาคารเรียบร้อยแล้ว"
            });
        } else {
            res.status(404).json({
                status: "error",
                message: "ไม่พบข้อมูลพิกัดของอาคารที่ต้องการลบ"
            });
        }

    } catch (error) {
        console.error('Error in /reference_point/:id (DELETE):', error);
        return res.status(500).json({
            status: "error",
            message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะลบข้อมูล: " + error.message
        });
    }
});

// PUT: อัปเดตข้อมูลพิกัดขอบเขต
router.put('/reference_point/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            building_id, 
            corner1_coord_x, corner1_coord_y, 
            corner2_coord_x, corner2_coord_y, 
            corner3_coord_x, corner3_coord_y, 
            corner4_coord_x, corner4_coord_y, 
            building_image_path
        } = req.body;

        if (building_id === null || building_id === undefined || building_id === '' || isNaN(parseInt(building_id))) {
            return res.status(400).json({
                status: 'error',
                message: "กรุณาระบุ ID ของอาคาร (building_id) ที่ถูกต้องและไม่เป็นค่าว่าง"
            });
        }

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                status: 'error',
                message: 'ID ไม่ถูกต้อง กรุณาระบุ ID ที่เป็นตัวเลข'
            });
        }
        
        const requiredFields = [
            building_id, corner1_coord_x, corner1_coord_y,
            corner2_coord_x, corner2_coord_y, corner3_coord_x,
            corner3_coord_y, corner4_coord_x, corner4_coord_y
        ];
        if (requiredFields.some(val => val === null || val === undefined || val === '')) {
            return res.status(400).json({
                status: 'error',
                message: "กรุณากรอกข้อมูลให้ครบถ้วน!"
            });
        }

        const coords = [
            { x: parseFloat(corner1_coord_x), y: parseFloat(corner1_coord_y) },
            { x: parseFloat(corner2_coord_x), y: parseFloat(corner2_coord_y) },
            { x: parseFloat(corner3_coord_x), y: parseFloat(corner3_coord_y) },
            { x: parseFloat(corner4_coord_x), y: parseFloat(corner4_coord_y) }
        ];

        const existingPoint = await query('SELECT building_id FROM `reference_points` WHERE reference_points_id = ?', [id]);
        if (existingPoint.length === 0) {
            return res.status(404).send({
                status: 'error',
                message: 'ไม่พบข้อมูลพิกัดสำหรับ ID ที่ต้องการอัปเดต'
            });
        }
        
        let duplicateMessages = [];
        
        const allExistingPoints = await query(`
            SELECT rp.building_id, b.building_name, 
            rp.corner1_coord_x, rp.corner1_coord_y,
            rp.corner2_coord_x, rp.corner2_coord_y,
            rp.corner3_coord_x, rp.corner3_coord_y,
            rp.corner4_coord_x, rp.corner4_coord_y
            FROM \`reference_points\` rp
            JOIN \`building\` b ON rp.building_id = b.building_id
            WHERE rp.reference_points_id != ?
        `, [id]);

        const newPolygonCentroid = calculateCentroid(coords);
        for (const existingRow of allExistingPoints) {
            const existingPolygonCorners = [
                { x: parseFloat(existingRow.corner1_coord_x), y: parseFloat(existingRow.corner1_coord_y) },
                { x: parseFloat(existingRow.corner2_coord_x), y: parseFloat(existingRow.corner2_coord_y) },
                { x: parseFloat(existingRow.corner3_coord_x), y: parseFloat(existingRow.corner3_coord_y) },
                { x: parseFloat(existingRow.corner4_coord_x), y: parseFloat(existingRow.corner4_coord_y) }
            ];

            if (isPointInPolygon(newPolygonCentroid, existingPolygonCorners) || 
                coords.some(c => isPointInPolygon(c, existingPolygonCorners))) {
                duplicateMessages.push(`การกำหนดขอบเขตซ้ำกับบริเวณที่เคยกำหนดไปแล้วของตึก "${existingRow.building_name}"`);
            }
            const existingPolygonCentroid = calculateCentroid(existingPolygonCorners);
            if (isPointInPolygon(existingPolygonCentroid, coords) || 
                existingPolygonCorners.some(c => isPointInPolygon(c, coords))) {
                duplicateMessages.push(`การกำหนดขอบเขตซ้ำกับบริเวณที่เคยกำหนดไปแล้วของตึก "${existingRow.building_name}"`);
            }
        }
        
        duplicateMessages = [...new Set(duplicateMessages)];
        
        if (duplicateMessages.length > 0) {
            return res.status(409).send({
                status: 'error',
                message: 'ไม่สามารถอัปเดตได้เนื่องจากข้อมูลซ้ำ',
                duplicates: duplicateMessages
            });
        }
        
        const updateQuery = `
            UPDATE \`reference_points\` 
            SET
                \`building_id\` = ?,
                \`corner1_coord_x\` = ?, 
                \`corner1_coord_y\` = ?, 
                \`corner2_coord_x\` = ?, 
                \`corner2_coord_y\` = ?, 
                \`corner3_coord_x\` = ?, 
                \`corner3_coord_y\` = ?, 
                \`corner4_coord_x\` = ?, 
                \`corner4_coord_y\` = ?,
                \`building_image_path\` = ?
            WHERE \`reference_points_id\` = ?;
        `;

        const updateParams = [
            building_id,
            coords[0].x, coords[0].y,
            coords[1].x, coords[1].y,
            coords[2].x, coords[2].y,
            coords[3].x, coords[3].y,
            building_image_path !== undefined ? building_image_path : null,
            id
        ];

        const result = await query(updateQuery, updateParams);

        if (result.affectedRows > 0) {
            return res.status(200).send({
                status: "success",
                message: "อัปเดตข้อมูลพิกัดอาคารสำเร็จ!"
            });
        } else {
            return res.status(500).send({
                status: "error",
                message: "ไม่สามารถอัปเดตข้อมูลได้"
            });
        }

    } catch (error) {
        console.error('Error in /reference_point/:id (PUT):', error);
        return res.status(500).send({
            status: "error",
            message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะอัปเดตข้อมูล: " + error.message
        });
    }
});

module.exports = router;