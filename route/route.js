const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const con = require('../config/config');
const { promisify } = require('util');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const router = express.Router();
const query = promisify(con.query).bind(con);

// นำเข้า Middleware ตรวจสอบสิทธิ์
const { verifyToken, isAdmin } = require('../middleware/auth');

/*-----------------------------------------------------------------------------------------------------------------------------*/
// GET: ดึงประเภทเส้นทาง (Public)
router.get('/filtered_route_types', async (req, res) => {
    try {
        const { isFixedRoute } = req.query;
        let sqlQuery = 'SELECT route_type_id, route_type FROM `route_type`';
        const params = [];

        if (isFixedRoute !== undefined && isFixedRoute !== null) {
            const isFixedRouteValue = (isFixedRoute === '1' || isFixedRoute === 'true') ? 1 : 
                                      (isFixedRoute === '0' || isFixedRoute === 'false') ? 0 : null;

            if (isFixedRouteValue !== null) {
                sqlQuery += ' WHERE is_fixed_route = ?';
                params.push(isFixedRouteValue);
            }
        }

        sqlQuery += ' ORDER BY route_type_id ASC';
        const results = await query(sqlQuery, params);
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /filtered_route_types (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประเภทเส้นทาง: ' + error.message });
    }
});

// GET: ดึงข้อมูลอาคารทั้งหมด (Public)
router.get('/buildings_without_coordinates', async (req, res) => {
    try {
        const sqlQuery = `SELECT building_id, building_name FROM building ORDER BY building_name ASC;`;
        const results = await query(sqlQuery);
        
        if (results.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบข้อมูลอาคารในระบบ' });
        }
        
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /buildings_without_coordinates (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลอาคาร: ' + error.message });
    }
});

// POST: เพิ่มเส้นทาง
router.post('/add_route', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            start_building_id: startBuildingId,
            end_building_id: endBuildingId,
            route_type_id: routeTypeId,
            route_points: routePoints,
            is_other_route: isOtherRoute,
            route_other_name: routeName,
            route_color: routeColor 
        } = req.body;

        if (!routeTypeId) {
            return res.status(400).send({ status: 'error', message: 'ไม่ได้ระบุประเภทเส้นทาง' });
        }
        
        const routeTypeExists = await query('SELECT route_type_id FROM `route_type` WHERE route_type_id = ?', [routeTypeId]);
        if (routeTypeExists.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบประเภทเส้นทางที่ระบุ' });
        }
        
        let routePointsString;
        try {
            routePointsString = JSON.stringify(JSON.parse(routePoints));
        } catch (e) {
            return res.status(400).send({ status: 'error', message: 'รูปแบบข้อมูลจุดเส้นทางไม่ถูกต้อง' });
        }

        if (isOtherRoute) {
            if (!routeName || !routeTypeId || !routePoints) {
                return res.status(400).send({ status: 'warning', message: 'กรุณากรอกชื่อเส้นทาง, ประเภท, และจุดเส้นทางให้ครบถ้วน' });
            }
            const checkOtherDuplicateSql = 'SELECT COUNT(*) AS count FROM `route_other` WHERE route_other_name = ? AND route_type_id = ?';
            const [otherDuplicateResult] = await query(checkOtherDuplicateSql, [routeName, routeTypeId]);

            if (otherDuplicateResult.count > 0) {
                return res.status(409).send({ status: 'warning', message: 'มีเส้นทางที่มีชื่อ "' + routeName + '" และประเภทเดียวกันนี้อยู่แล้ว' });
            }
            
            const sql = 'INSERT INTO `route_other` (route_other_name, route_other, route_type_id, route_other_color) VALUES (?, ?, ?, ?)';
            const params = [routeName, routePointsString, routeTypeId, routeColor]; 
            
            const result = await query(sql, params);
            if (result.affectedRows > 0) {
                return res.status(201).send({ status: 'success', message: 'บันทึกเส้นทางสำเร็จ' });
            } else {
                return res.status(500).send({ status: 'error', message: 'ไม่สามารถบันทึกเส้นทางได้' });
            }
        } else {
            if (!startBuildingId || !endBuildingId || !routeTypeId || !routePoints) {
                return res.status(400).send({ status: 'error', message: 'กรุณาให้ข้อมูลที่จำเป็นทั้งหมด' });
            }
            if (startBuildingId === endBuildingId) {
                return res.status(400).send({ status: 'warning', message: 'สถานที่เริ่มต้นและปลายทางต้องไม่ใช่อาคารเดียวกัน' });
            }

            const startBuildingExists = await query('SELECT building_id FROM `building` WHERE building_id = ?', [startBuildingId]);
            const endBuildingExists = await query('SELECT building_id FROM `building` WHERE building_id = ?', [endBuildingId]);
            if (startBuildingExists.length === 0 || endBuildingExists.length === 0) {
                return res.status(404).send({ status: 'error', message: 'ไม่พบสถานที่เริ่มต้นหรือปลายทาง' });
            }

            const checkDuplicateSql = `
                SELECT COUNT(*) AS count
                FROM \`routes\`
                WHERE ((start_building_id = ? AND end_building_id = ?) 
                    OR (start_building_id = ? AND end_building_id = ?))
                AND route_type_id = ?
            `;
            const checkDuplicateParams = [startBuildingId, endBuildingId, endBuildingId, startBuildingId, routeTypeId];
            const [duplicateResult] = await query(checkDuplicateSql, checkDuplicateParams);
            
            if (duplicateResult.count > 0) {
                return res.status(409).send({ status: 'warning', message: 'เลือกจุดเริ่มต้น ปลายทาง และประเภทเส้นทางซ้ำ' });
            }

            const insertSql = 'INSERT INTO `routes` (start_building_id, end_building_id, route_type_id, route_points, route_color) VALUES (?, ?, ?, ?, ?)';
            const insertParams = [startBuildingId, endBuildingId, routeTypeId, routePointsString, routeColor];
            const result = await query(insertSql, insertParams);

            if (result.affectedRows > 0) {
                return res.status(201).send({ status: 'success', message: 'บันทึกเส้นทางสำเร็จ' });
            } else {
                return res.status(500).send({ status: 'error', message: 'ไม่สามารถบันทึกเส้นทางได้' });
            }
        }
    } catch (error) {
        console.error('Error in /add_route (POST):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์: ' + error.message });
    }
});

// PUT: อัปเดตเส้นทางปกติ
router.put('/update_route/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            start_building_id,
            end_building_id,
            route_type_id,
            route_points,
            route_color 
        } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).send({ status: 'error', message: 'ID เส้นทางไม่ถูกต้อง' });
        }
        if (!start_building_id || !end_building_id || !route_type_id || !route_points) {
            return res.status(400).send({ status: 'error', message: 'กรุณาส่งข้อมูลที่จำเป็นสำหรับการอัปเดตให้ครบถ้วน' });
        }
        if (start_building_id === end_building_id) {
            return res.status(400).send({ status: 'error', message: 'สถานที่เริ่มต้นและปลายทางต้องไม่ใช่อาคารเดียวกัน' });
        }

        let routePointsString;
        try {
            routePointsString = JSON.stringify(JSON.parse(route_points));
        } catch (e) {
            return res.status(400).send({ status: 'error', message: 'รูปแบบข้อมูลจุดเส้นทางไม่ถูกต้อง' });
        }

        const checkDuplicateSql = `
            SELECT COUNT(*) AS count FROM \`routes\`
            WHERE 
                ((start_building_id = ? AND end_building_id = ?) OR (start_building_id = ? AND end_building_id = ?))
                AND route_type_id = ?
                AND route_id != ? 
        `;
        const checkDuplicateParams = [start_building_id, end_building_id, end_building_id, start_building_id, route_type_id, id];
        const [duplicateResult] = await query(checkDuplicateSql, checkDuplicateParams);
        
        if (duplicateResult.count > 0) {
            return res.status(409).send({ status: 'warning', message: 'มีเส้นทางระหว่างอาคารคู่นี้และประเภทเดียวกันอยู่แล้ว' });
        }

        const updateSql = `
            UPDATE \`routes\` SET 
                start_building_id = ?, 
                end_building_id = ?, 
                route_type_id = ?, 
                route_points = ?,
                route_color = ? 
            WHERE route_id = ?
        `;
        const updateParams = [start_building_id, end_building_id, route_type_id, routePointsString, route_color, id];
        const result = await query(updateSql, updateParams);
        
        if (result.affectedRows > 0) {
            return res.status(200).send({ status: 'success', message: 'อัปเดตเส้นทางสำเร็จ' });
        } else {
            return res.status(200).send({ status: 'success', message: 'ไม่มีการเปลี่ยนแปลงข้อมูล' });
        }

    } catch (error) {
        console.error('Error in /update_route/:id (PUT):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะอัปเดตเส้นทาง: ' + error.message });
    }
});

// PUT: อัปเดตเส้นทางแบบอื่นๆ
router.put('/update_route_other/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            route_other_name: routeName,
            route_points: routePoints,
            route_type_id: routeTypeId,
            route_color: routeColor 
        } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).send({ status: 'error', message: 'ID เส้นทางไม่ถูกต้อง' });
        }
        if (!routeName || !routePoints || !routeTypeId) {
            return res.status(400).send({ status: 'warning', message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
        }

        const checkDuplicateSql = `
            SELECT COUNT(*) AS count 
            FROM \`route_other\` 
            WHERE route_other_name = ? 
              AND route_type_id = ? 
              AND route_other_id != ?
        `;
        const [duplicateResult] = await query(checkDuplicateSql, [routeName, routeTypeId, id]);

        if (duplicateResult.count > 0) {
            return res.status(409).send({ status: 'warning', message: 'มีเส้นทางอื่นที่มีชื่อและประเภทเดียวกันนี้อยู่แล้ว' });
        }

        let routePointsString;
        try {
            routePointsString = JSON.stringify(JSON.parse(routePoints));
        } catch (e) {
            return res.status(400).send({ status: 'error', message: 'รูปแบบข้อมูลจุดเส้นทางไม่ถูกต้อง' });
        }
        
        const [existingRoute] = await query('SELECT * FROM \`route_other\` WHERE route_other_id = ?', [id]);
        if (!existingRoute) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบเส้นทางที่ต้องการอัปเดต' });
        }

        const sql = 'UPDATE `route_other` SET route_other_name = ?, route_other = ?, route_type_id = ?, route_other_color = ? WHERE route_other_id = ?';
        const params = [routeName, routePointsString, routeTypeId, routeColor, id];
        const result = await query(sql, params);
        
        if (result.affectedRows > 0) {
            return res.status(200).send({ status: 'success', message: 'อัปเดตเส้นทางอื่นๆ สำเร็จ' });
        } else {
            return res.status(200).send({ status: 'success', message: 'ไม่มีการเปลี่ยนแปลงข้อมูล' });
        }

    } catch (error) {
        console.error('Error in /update_route_other/:id (PUT):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะอัปเดตเส้นทางอื่นๆ: ' + error.message });
    }
});

// DELETE: ลบเส้นทางปกติ 
router.delete('/delete_route/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).send({ status: 'error', message: 'ID เส้นทางไม่ถูกต้อง' });
        }

        const result = await query('DELETE FROM `routes` WHERE route_id = ?', [id]);

        if (result.affectedRows > 0) {
            return res.status(200).send({ status: 'success', message: `ลบเส้นทาง ID ${id} บันทึกสำเร็จ` });
        } else {
            return res.status(404).send({ status: 'error', message: `ไม่พบเส้นทาง ID ${id} ที่จะลบ` });
        }
    } catch (error) {
        console.error('Error in /delete_route (DELETE):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะลบเส้นทาง: ' + error.message });
    }
});

// DELETE: ลบเส้นทางแบบ "อื่นๆ"
router.delete('/delete_route_other/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).send({ status: 'error', message: 'ID เส้นทางไม่ถูกต้อง' });
        }

        const result = await query('DELETE FROM `route_other` WHERE route_other_id = ?', [id]);

        if (result.affectedRows > 0) {
            return res.status(200).send({ status: 'success', message: `ลบเส้นทางอื่นๆ ID ${id} บันทึกสำเร็จ` });
        } else {
            return res.status(404).send({ status: 'error', message: `ไม่พบเส้นทางอื่นๆ ID ${id} ที่จะลบ` });
        }
    } catch (error) {
        console.error('Error in /delete_route_other/:id (DELETE):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะลบเส้นทาง: ' + error.message });
    }
});

/*-----------------------------------------------------------------------------------------------------------------------------*/
// ดึงข้อมูล (Public)
/*-----------------------------------------------------------------------------------------------------------------------------*/
router.get('/routes', async (req, res) => {
    try {
        const sqlQuery = `
            SELECT 
                r.route_id, 
                '-' AS route_name,
                sb.building_name AS start_building_name, 
                eb.building_name AS end_building_name,
                rt.route_type AS route_type_name,
                r.route_points,
                r.route_color
            FROM routes r
            JOIN building sb ON r.start_building_id = sb.building_id
            JOIN building eb ON r.end_building_id = eb.building_id
            JOIN route_type rt ON r.route_type_id = rt.route_type_id
            ORDER BY r.route_id DESC;
        `;
        const results = await query(sqlQuery);
        if (results.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบข้อมูลเส้นทาง' });
        }
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /routes (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเส้นทาง: ' + error.message });
    }
});

router.get('/routes_other', async (req, res) => {
    try {
        const sqlQuery = `
            SELECT 
                ro.route_other_id, 
                ro.route_other_name, 
                ro.route_other,
                rt.route_type AS route_type_name,
                ro.route_other_color
            FROM route_other ro
            JOIN route_type rt ON ro.route_type_id = rt.route_type_id
            ORDER BY ro.route_other_id DESC;
        `;
        const results = await query(sqlQuery);
        if (results.length === 0) {
            return res.status(404).send({ status: 'error', message: 'ไม่พบข้อมูลเส้นทางแบบอื่นๆ' });
        }
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /routes_other (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเส้นทางแบบอื่นๆ: ' + error.message });
    }
});

router.get('/get_route/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sqlQuery = `
            SELECT 
                r.route_id, 
                sb.building_name AS start_building_name, 
                eb.building_name AS end_building_name,
                r.start_building_id,
                r.end_building_id,
                rt.route_type AS route_type_name,
                r.route_type_id,
                r.route_points,
                r.route_color
            FROM routes r
            JOIN building sb ON r.start_building_id = sb.building_id
            JOIN building eb ON r.end_building_id = eb.building_id
            JOIN route_type rt ON r.route_type_id = rt.route_type_id
            WHERE r.route_id = ?;
        `;
        const result = await query(sqlQuery, [id]);

        if (result.length === 0) {
            return res.status(404).send({ status: 'error', message: `ไม่พบเส้นทาง ID ${id}` });
        }

        return res.status(200).send({ status: 'success', data: result[0] });
    } catch (error) {
        console.error('Error in /get_route/:id (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเส้นทาง: ' + error.message });
    }
});

router.get('/get_route_other/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sqlQuery = `
            SELECT 
                ro.route_other_id, 
                ro.route_other_name, 
                ro.route_other,
                rt.route_type AS route_type_name,
                ro.route_type_id,
                ro.route_other_color AS route_color 
            FROM route_other ro
            JOIN route_type rt ON ro.route_type_id = rt.route_type_id
            WHERE ro.route_other_id = ?;
        `;
        const result = await query(sqlQuery, [id]);

        if (result.length === 0) {
            return res.status(404).send({ status: 'error', message: `ไม่พบเส้นทาง ID ${id}` });
        }

        return res.status(200).send({ status: 'success', data: result[0] });
    } catch (error) {
        console.error('Error in /get_route_other/:id (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเส้นทาง: ' + error.message });
    }
});

router.get('/routes_by_type/:typeId', async (req, res) => {
    try {
        const { typeId } = req.params;

        if (!typeId || isNaN(parseInt(typeId))) {
            return res.status(400).send({ status: 'error', message: 'ID ประเภทเส้นทางไม่ถูกต้อง' });
        }

        const sqlQuery = `
            SELECT 
                ro.route_other_id, 
                ro.route_other,
                ro.route_other_color, 
                NULL AS route_color 
            FROM route_other ro
            WHERE ro.route_type_id = ?;
        `;
        
        const results = await query(sqlQuery, [typeId]);
        
        return res.status(200).send({ status: 'success', data: results });

    } catch (error) {
        console.error('Error in /routes_by_type/:typeId (GET):', error);
        return res.status(500).send({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเส้นทางตามประเภท: ' + error.message });
    }
});

module.exports = router;