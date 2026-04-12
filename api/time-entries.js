const { getPool } = require('./_db');
const { getUser, requireAdmin } = require('./_auth');
const Decimal = require('decimal.js');

function mapEntry(r) {
  return {
    id: r.id, employeeId: r.employee_id, workDate: r.work_date,
    objectId: r.object_id, hoursWorked: r.hours_worked,
    createdAt: r.created_at, updatedAt: r.updated_at,
    employee: r.emp_name ? { fullName: r.emp_name } : undefined,
    workObject: r.obj_name ? { name: r.obj_name } : undefined,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getUser(req, res);
  if (!user) return;

  const pool = getPool();

  try {
    // GET /api/time-entries — admin sees all
    if (req.method === 'GET') {
      if (!requireAdmin(user, res)) return;
      const { year, month } = req.query;
      let q = `SELECT te.*, e.full_name as emp_name, wo.name as obj_name
               FROM time_entries te
               JOIN employees e ON e.id = te.employee_id
               JOIN work_objects wo ON wo.id = te.object_id
               WHERE 1=1`;
      const params = [];
      if (year)  { params.push(year);  q += ` AND EXTRACT(YEAR  FROM te.work_date)=$${params.length}`; }
      if (month) { params.push(month); q += ` AND EXTRACT(MONTH FROM te.work_date)=$${params.length}`; }
      q += ' ORDER BY te.work_date DESC, te.created_at DESC';
      const { rows } = await pool.query(q, params);
      return res.json(rows.map(mapEntry));
    }

    // POST /api/time-entries — employee creates own entry
    if (req.method === 'POST') {
      const { workDate, objectId, hoursWorked } = req.body;
      if (!workDate || !objectId || !hoursWorked)
        return res.status(400).json({ message: 'Заполните все поля' });

      const newH = new Decimal(hoursWorked);
      if (newH.lte(0)) return res.status(400).json({ message: 'Часы должны быть больше 0' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: objs } = await client.query(
          'SELECT is_active FROM work_objects WHERE id=$1', [objectId]
        );
        if (!objs.length || !objs[0].is_active)
          return res.status(404).json({ message: 'Объект не найден или неактивен' });

        const { rows: sums } = await client.query(
          `SELECT COALESCE(SUM(hours_worked),0) as total
           FROM time_entries WHERE employee_id=$1 AND work_date=$2 FOR UPDATE`,
          [user.id, workDate]
        );
        const existing = new Decimal(sums[0].total);
        if (existing.plus(newH).gt(12)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Превышен дневной лимит (12 ч). Уже внесено: ${existing.toFixed(2)}ч`
          });
        }

        const { rows } = await client.query(
          `INSERT INTO time_entries (employee_id, work_date, object_id, hours_worked, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
          [user.id, workDate, objectId, newH.toFixed(2), user.id]
        );
        await client.query('COMMIT');
        return res.status(201).json(mapEntry(rows[0]));
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
