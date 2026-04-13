const { getPool } = require('../_db');
const { getUser } = require('../_auth');

function mapEntry(r) {
  return {
    id: r.id, employeeId: r.employee_id, workDate: r.work_date,
    objectId: r.object_id, hoursWorked: r.hours_worked,
    createdAt: r.created_at, updatedAt: r.updated_at,
    workObject: r.obj_name ? { name: r.obj_name } : undefined,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Phone');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUser(req, res);
  if (!user) return;
  if (req.method !== 'GET') return res.status(405).end();

  const pool = getPool();
  try {
    const { year, month } = req.query;
    let q = `SELECT te.*, wo.name as obj_name
             FROM time_entries te
             JOIN work_objects wo ON wo.id = te.object_id
             WHERE te.employee_id = $1`;
    const params = [user.id];
    if (year)  { params.push(year);  q += ` AND EXTRACT(YEAR  FROM te.work_date)=$${params.length}`; }
    if (month) { params.push(month); q += ` AND EXTRACT(MONTH FROM te.work_date)=$${params.length}`; }
    q += ' ORDER BY te.work_date DESC, te.created_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows.map(mapEntry));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
