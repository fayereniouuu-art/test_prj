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

// GET: ดึงข้อมูลอาคารทั้งหมดที่เกี่ยวข้องกับประเภทเส้นทางที่เลือก
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

// 🟢 GET: ดึงข้อมูลอาคารปลายทางทั้งหมดที่สามารถเดินไปได้จากจุดเริ่มต้น (สำหรับ Dropdown ช่องที่ 3)
router.get('/connected_buildings/:startId/:typeId', async (req, res) => {
    try {
        const { startId, typeId } = req.params;
        
        // SQL: ดึงตึกทั้งหมดที่มีอยู่ในเส้นทางประเภทนี้ (typeId) แต่ "ยกเว้น" ตึกที่เป็นจุดเริ่มต้น (startId)
        const sqlQuery = `
            SELECT DISTINCT b.building_id, b.building_name
            FROM building b
            WHERE b.building_id IN (
                SELECT start_building_id FROM routes WHERE route_type_id = ? AND start_building_id IS NOT NULL
                UNION
                SELECT end_building_id FROM routes WHERE route_type_id = ? AND end_building_id IS NOT NULL
            )
            AND b.building_id != ?
            ORDER BY b.building_name ASC;
        `;
        
        const results = await query(sqlQuery, [typeId, typeId, startId]);
        
        return res.status(200).send({ status: 'success', data: results });
    } catch (error) {
        console.error('Error in /connected_buildings:', error);
        return res.status(500).send({ status: 'error', message: 'Error fetching connected buildings' });
    }
});

// 🟢 GET: ค้นหาพิกัดเส้นทางระหว่างจุดเริ่มต้นและปลายทาง (สำหรับปุ่มค้นหาและวาดเส้น)
router.get('/find_route/:startId/:endId/:typeId', async (req, res) => {
    try {
        const { startId, endId, typeId } = req.params;
        
        // ค้นหาเส้นทางที่ตรงกับประเภท และจุดเริ่มต้น-ปลายทาง (สลับไปมาได้)
        const sqlQuery = `
            SELECT route_points, route_color, start_building_id 
            FROM routes 
            WHERE route_type_id = ? 
              AND ((start_building_id = ? AND end_building_id = ?) 
                   OR (start_building_id = ? AND end_building_id = ?))
            LIMIT 1;
        `;
        
        const results = await query(sqlQuery, [typeId, startId, endId, endId, startId]);
        
        if (results && results.length > 0) {
            return res.status(200).send({ status: 'success', data: results[0] });
        } else {
            return res.status(404).send({ status: 'error', message: 'ไม่พบข้อมูลเส้นทางที่เชื่อมต่อกันในระบบ' });
        }
    } catch (error) {
        console.error('Error in /find_route:', error);
        return res.status(500).send({ status: 'error', message: 'Error finding route' });
    }
});

module.exports = router;
