const express = require('express');
const router = express.Router();
const con = require('../config/config');
const { promisify } = require('util');

const query = promisify(con.query).bind(con);

// GET: ดึงข้อมูลชื่อเส้นทางอื่นๆ ทั้งหมดตามประเภทที่เลือก
router.get('/other_routes_by_type/:typeId', async (req, res) => {
    try {
        const { typeId } = req.params;
        const sqlQuery = `
            SELECT route_other_id, route_other_name, route_other AS route_points, route_other_color AS route_color 
            FROM route_other WHERE route_type_id = ? ORDER BY route_other_name ASC;
        `;
        const results = await query(sqlQuery, [typeId]);
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /other_routes_by_type:', error);
        return res.status(500).send({ status: 'error', message: 'Error fetching routes' });
    }
});

// GET: ดึงข้อมูลอาคารทั้งหมดที่เกี่ยวข้องกับประเภทเส้นทางที่เลือก (ตัวแก้ 404)
router.get('/buildings_by_type/:typeId', async (req, res) => {
    try {
        const { typeId } = req.params;
        const sqlQuery = `
            SELECT DISTINCT b.building_id, b.building_name
            FROM building b
            WHERE b.building_id IN (
                SELECT start_building_id FROM routes WHERE route_type_id = ? AND start_building_id IS NOT NULL
                UNION
                SELECT end_building_id FROM routes WHERE route_type_id = ? AND end_building_id IS NOT NULL
            )
            ORDER BY b.building_name ASC;
        `;
        const results = await query(sqlQuery, [typeId, typeId]);
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /buildings_by_type:', error);
        return res.status(500).send({ status: 'error', message: 'Error fetching buildings by type' });
    }
});

// ฟังก์ชันอื่นๆ (connected_buildings, find_route) ให้คงไว้ตามเดิมได้เลยครับ

module.exports = router;
